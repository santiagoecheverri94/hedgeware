import {expect, test} from '@oclif/test'

describe('testParentCommand:testSubCom', () => {
  test
  .stdout()
  .command(['testParentCommand:testSubCom'])
  .it('runs hello', ctx => {
    expect(ctx.stdout).to.contain('hello world')
  })

  test
  .stdout()
  .command(['testParentCommand:testSubCom', '--name', 'jeff'])
  .it('runs hello --name jeff', ctx => {
    expect(ctx.stdout).to.contain('hello jeff')
  })
})
