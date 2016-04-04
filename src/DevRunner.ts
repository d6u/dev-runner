import {EventEmitter} from 'events';
import Maxcon from 'maxcon';
import {Configs, TransformedConfigs, transformConfigs} from './utils';

export default class DevRunner {
  private transformedConfig: TransformedConfigs;
  private maxcon: Maxcon = null;

  constructor(config: Configs) {
    this.transformedConfig = transformConfigs(config);
  }

  run(done: (err: Error) => void) {
    this.maxcon = new Maxcon(this.transformedConfig);
    this.maxcon.connect(done);
  }

  stop() {
    this.maxcon.dispose();
    this.maxcon = null;
  }
}
