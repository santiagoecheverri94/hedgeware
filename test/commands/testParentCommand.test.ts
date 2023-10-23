import {expect, test} from '@oclif/test'

describe('testParentCommand', () => {
  test
  .stdout()
  .command(['testParentCommand'])
  .it('runs hello', ctx => {
    expect(ctx.stdout).to.contain('hello world')
  })

  test
  .stdout()
  .command(['testParentCommand', '--name', 'jeff'])
  .it('runs hello --name jeff', ctx => {
    expect(ctx.stdout).to.contain('hello jeff')
  })
})
