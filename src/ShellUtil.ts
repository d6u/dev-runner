import {spawn as _spawn} from 'child_process';
import {Observable, Observer} from 'rx';

export function spawn(cmd: string): Observable<string> {
  return Observable.create((observer: Observer<string>) => {
    console.log(`---> Spawning ${cmd}`)

    const args = cmd.split(' ');
    const child = _spawn(args[0], args.slice(1), {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (buffer: Buffer) => {
      process.stdout.write(buffer);
      observer.onNext(buffer.toString());
    });

    child.stderr.on('data', (buffer: Buffer) => {
      process.stderr.write(buffer);
      observer.onNext(buffer.toString());
    });

    child.on('exit', () => {
      observer.onCompleted();
    });

    return () => {
      console.log(`---> Stopping "${cmd}"`);

      child.kill();
    };
  });
}
