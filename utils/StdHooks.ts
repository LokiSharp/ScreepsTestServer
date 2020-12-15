// eslint-disable-next-line @typescript-eslint/unbound-method
const stdout = process.stdout.write;
// eslint-disable-next-line @typescript-eslint/unbound-method
const stderr = process.stderr.write;

export default class StdHooks {
  public static hookWrite(): void {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    process.stdout.write = function (...args): boolean {
      if (/connecting to storage/i.exec(args[0])) {
        return false;
      }
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      return stdout.apply(this, args);
    };
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    process.stderr.write = function (...args): boolean {
      if (/storage connection lost/i.exec(args[0])) {
        return false;
      }
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      return stdout.apply(this, args);
    };
  }

  /*
      Reset stdout/stderr.write() to default behavior.
  */
  public static resetWrite(): void {
    process.stdout.write = stdout;
    process.stderr.write = stderr;
  }
}
