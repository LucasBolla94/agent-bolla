import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export class ShellRunner {
  constructor(private readonly cwd: string = process.cwd()) {}

  async run(command: string, args: string[] = []): Promise<CommandResult> {
    try {
      const { stdout, stderr } = await execFileAsync(command, args, {
        cwd: this.cwd,
        maxBuffer: 10 * 1024 * 1024
      });

      return {
        stdout: stdout?.toString() ?? '',
        stderr: stderr?.toString() ?? ''
      };
    } catch (error) {
      const e = error as {
        stdout?: string;
        stderr?: string;
        message?: string;
      };

      throw new Error(
        `Command failed: ${command} ${args.join(' ')}\n${e.message ?? ''}\n${e.stderr ?? ''}\n${e.stdout ?? ''}`.trim()
      );
    }
  }
}
