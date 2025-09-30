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
  const API_URL = `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/subscription`;

  try {
    await axios.get(API_URL, {timeout: 3000});
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 403) {
      core.error('Subscription is not valid. Reach out to support@stepsecurity.io');
      process.exit(1);
    } else {
      core.info('Timeout or API not reachable. Continuing to next step.');
    }
  }
}
