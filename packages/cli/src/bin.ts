#!/usr/bin/env bun
import { Command } from 'commander'
import { runValidate } from './validate'

const program = new Command()
program
  .name('tabularium')
  .description('CLI for Tabularium plugin authors')
  .version('0.0.0')

program
  .command('validate <file>')
  .description('validate a Tabularium plugin manifest against a registry schema')
  .requiredOption('--registry <url>', 'registry base URL (e.g. https://registry.example.com)')
  .option('--kind <kind>', 'validate against the kind-specific schema variant')
  .action(async (file: string, opts: { registry: string; kind?: string }) => {
    const exitCode = await runValidate(file, opts)
    process.exit(exitCode)
  })

program.parseAsync(process.argv)
