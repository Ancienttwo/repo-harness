export function temporaryPath(value: string | undefined, directory?: boolean): string | null;
export function unsafeTestToolRoot(env: NodeJS.ProcessEnv): string | null;
export function createTemporaryTestEnvironment(inherited: NodeJS.ProcessEnv): {
  env: NodeJS.ProcessEnv;
  home: string;
  temp: string;
};
