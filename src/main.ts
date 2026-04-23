import retry from 'async-retry';
import {execa} from 'execa';
import fs from 'fs';
import * as os from 'os';
import path from 'path';
import * as context from './context';
import * as containerd from './containerd';
import * as stateHelper from './state-helper';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import axios, {isAxiosError} from 'axios';

async function run(): Promise<void> {
  try {
    await validateSubscription();
    if (os.platform() !== 'linux') {
      core.setFailed('Only supported on linux platform');
      return;
    }

    const inputs: context.Inputs = await context.getInputs();
    core.startGroup(`Download and install containerd`);
    const install = await containerd.install(inputs.version);
    core.endGroup();

    let configFile, configContent;
    if (inputs.config) {
      [configFile, configContent] = await containerd.getConfigFile(inputs.config);
    } else if (inputs.configInline) {
      [configFile, configContent] = await containerd.getConfigInline(inputs.configInline);
    } else {
      [configFile, configContent] = await containerd.getConfigDefault();
    }

    core.startGroup(`Configuration`);
    core.info(configContent);
    core.endGroup();

    core.startGroup(`Starting containerd ${install.version}`);
    const logfile = path.join(context.tmpDir(), 'containerd.log');
    const out = fs.openSync(logfile, 'w');
    stateHelper.setLogfile(logfile);
    await execa(`sudo containerd --config ${configFile} &> ${logfile}`, {
      detached: true,
      shell: true,
      cleanup: false,
      stdio: ['ignore', out, out]
    });
    await retry(
      async bail => {
        await exec
          .getExecOutput('sudo ctr --connect-timeout 1s version', undefined, {
            ignoreReturnCode: true,
            silent: true
          })
          .then(res => {
            if (res.stderr.length > 0 && res.exitCode != 0) {
              bail(new Error(res.stderr));
              return;
            }
            return true;
          });
      },
      {
        retries: 5
      }
    );
    core.endGroup();
  } catch (error) {
    core.setFailed(error.message);
  }
}

async function cleanup(): Promise<void> {
  await exec.exec('sudo killall containerd');
  if (stateHelper.logfile.length == 0) {
    return;
  }
  core.startGroup('containerd logs');
  core.info(fs.readFileSync(stateHelper.logfile, {encoding: 'utf8'}));
  core.endGroup();
}

if (!stateHelper.IsPost) {
  run();
} else {
  cleanup();
}

async function validateSubscription(): Promise<void> {
  const eventPath = process.env.GITHUB_EVENT_PATH
  let repoPrivate: boolean | undefined

  if (eventPath && fs.existsSync(eventPath)) {
    const eventData = JSON.parse(fs.readFileSync(eventPath, 'utf8'))
    repoPrivate = eventData?.repository?.private
  }

  const upstream = 'crazy-max/ghaction-setup-containerd'
  const action = process.env.GITHUB_ACTION_REPOSITORY
  const docsUrl =
    'https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions'

  core.info('')
  core.info('[1;36mStepSecurity Maintained Action[0m')
  core.info(`Secure drop-in replacement for ${upstream}`)
  if (repoPrivate === false)
    core.info('[32m✓ Free for public repositories[0m')
  core.info(`[36mLearn more:[0m ${docsUrl}`)
  core.info('')

  if (repoPrivate === false) return

  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com'
  const body: Record<string, string> = {action: action || ''}
  if (serverUrl !== 'https://github.com') body.ghes_server = serverUrl
  try {
    await axios.post(
      `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/maintained-actions-subscription`,
      body,
      {timeout: 3000}
    )
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 403) {
      core.error(
        `[1;31mThis action requires a StepSecurity subscription for private repositories.[0m`
      )
      core.error(
        `[31mLearn how to enable a subscription: ${docsUrl}[0m`
      )
      process.exit(1)
    }
    core.info('Timeout or API not reachable. Continuing to next step.')
  }
}
