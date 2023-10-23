import {expect, test} from '@oclif/test'

describe('stop-loss-arb:new-state', () => {
  test
  .stdout()
  .command(['stop-loss-arb:new-state'])
  .it('runs hello', ctx => {
    expect(ctx.stdout).to.contain('hello world')
  })

  test
  .stdout()
  .command(['stop-loss-arb:new-state', '--name', 'jeff'])
  .it('runs hello --name jeff', ctx => {
    expect(ctx.stdout).to.contain('hello jeff')
  })
})
