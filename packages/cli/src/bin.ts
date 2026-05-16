#!/usr/bin/env bun
import { Command } from 'commander'

const program = new Command()
program
  .name('tabularium')
  .description('CLI for Tabularium plugin authors')
  .version('0.0.0')

program.parse(process.argv)
