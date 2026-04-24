import chalk from 'chalk';

export function register(program, runtimeDeps, context = {}) {
  const voice = program
    .command('voice')
    .description('Bundled voice plugin commands');

  voice
    .command('status')
    .description('Show bundled voice plugin readiness')
    .action(async () => {
      await runtimeDeps.checkConnection();

      const hasKey = (() => {
        try {
          return Boolean(context.readRequiredCredential?.('apiKey'));
        } catch {
          return false;
        }
      })();

      console.log(chalk.cyan('voice plugin: ') + chalk.white('bundled'));
      console.log(chalk.cyan('credential apiKey: ') + (hasKey ? chalk.green('configured') : chalk.yellow('missing')));
    });
}
