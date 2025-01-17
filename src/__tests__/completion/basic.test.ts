import { Neovim } from '@chemzqm/neovim'
import { ISource, SourceType, CompleteResult, CompleteOption } from '../../types'
import { disposeAll } from '../../util'
import helper from '../helper'
import sources from '../../sources'
import { CancellationToken, Disposable } from 'vscode-jsonrpc'

let nvim: Neovim
let disposables: Disposable[] = []
beforeAll(async () => {
  await helper.setup()
  nvim = helper.nvim
})

afterAll(async () => {
  await helper.shutdown()
})

afterEach(async () => {
  disposeAll(disposables)
  await helper.reset()
})

describe('completion', () => {

  it('should not show word of word source on empty input', async () => {
    await nvim.setLine('foo bar')
    await helper.wait(200)
    await nvim.input('of')
    let res = await helper.visible('foo', 'around')
    expect(res).toBe(true)
    await nvim.input('<backspace>')
    await helper.wait(200)
    res = await helper.notVisible('foo')
    expect(res).toBe(true)
  })
  //
  it('should trigger on first letter insert', async () => {
    await helper.edit()
    await nvim.setLine('foo bar')
    await helper.wait(30)
    await nvim.input('of')
    let res = await helper.visible('foo', 'around')
    expect(res).toBe(true)
  })
  //
  it('should trigger on force refresh', async () => {
    await helper.edit()
    await nvim.setLine('foo f')
    await helper.wait(100)
    await nvim.input('A')
    await helper.wait(10)
    await nvim.call('coc#start')
    let res = await helper.visible('foo', 'around')
    expect(res).toBe(true)
  })
  //
  it('should filter and sort on increment search', async () => {
    await helper.edit()
    await nvim.setLine('forceDocumentSync format  fallback')
    await helper.wait(30)
    await nvim.input('of')
    await helper.waitPopup()
    let items = await helper.getItems()
    let l = items.length
    await nvim.input('oa')
    await helper.wait(100)
    items = await helper.getItems()
    expect(items.findIndex(o => o.word == 'fallback')).toBe(-1)
    expect(items.length).toBeLessThan(l)
  })
  //
  it('should not trigger on insert enter', async () => {
    await helper.edit()
    await nvim.setLine('foo bar')
    await helper.wait(30)
    await nvim.input('o')
    let visible = await nvim.call('pumvisible')
    expect(visible).toBe(0)
  })
  //
  it('should filter on fast input', async () => {
    await helper.edit()
    await nvim.setLine('foo bar')
    await helper.wait(60)
    await nvim.input('oba')
    await helper.waitPopup()
    let items = await helper.getItems()
    let item = items.find(o => o.word == 'foo')
    expect(item).toBeFalsy()
    expect(items[0].word).toBe('bar')
  })
  //
  it('should fix start column', async () => {
    await helper.edit()
    let source: ISource = {
      name: 'test',
      priority: 10,
      enable: true,
      firstMatch: false,
      sourceType: SourceType.Native,
      triggerCharacters: [],
      doComplete: async (): Promise<CompleteResult> => {
        let result: CompleteResult = {
          startcol: 0,
          items: [{ word: 'foo.bar' }]
        }
        return Promise.resolve(result)
      }
    }
    let disposable = sources.addSource(source)
    await nvim.setLine('foo.')
    await nvim.input('Ab')
    await helper.waitPopup()
    let val = await nvim.getVar('coc#_context') as any
    expect(val.start).toBe(0)
    disposable.dispose()
  })
  //
  it('should stop completion when type none trigger character', async () => {
    await helper.edit()
    let source: ISource = {
      name: 'test',
      priority: 10,
      enable: true,
      firstMatch: false,
      sourceType: SourceType.Native,
      triggerCharacters: [],
      doComplete: async (): Promise<CompleteResult> => {
        let result: CompleteResult = {
          items: [{ word: 'if(' }]
        }
        return Promise.resolve(result)
      }
    }
    disposables.push(sources.addSource(source))
    await nvim.setLine('')
    await nvim.input('iif')
    await helper.waitPopup()
    await nvim.input('(')
    await helper.wait(300)
    let res = await helper.pumvisible()
    expect(res).toBe(true)
  })
  //
  it('should trigger on triggerCharacters', async () => {
    await helper.edit()
    let source: ISource = {
      name: 'trigger',
      priority: 10,
      enable: true,
      sourceType: SourceType.Native,
      triggerCharacters: ['.'],
      doComplete: async (): Promise<CompleteResult> => Promise.resolve({
        items: [{ word: 'foo' }]
      })
    }
    disposables.push(sources.addSource(source))
    await nvim.input('i')
    await helper.wait(30)
    await nvim.input('.')
    await helper.waitPopup()
    let res = await helper.visible('foo', 'trigger')
    expect(res).toBe(true)
  })
  //
  it('should should complete items without input', async () => {
    await helper.edit()
    let source: ISource = {
      enable: true,
      name: 'trigger',
      priority: 10,
      sourceType: SourceType.Native,
      doComplete: async (): Promise<CompleteResult> => Promise.resolve({
        items: [{ word: 'foo' }, { word: 'bar' }]
      })
    }
    disposables.push(sources.addSource(source))
    await nvim.command('inoremap <silent><expr> <c-space> coc#refresh()')
    await nvim.input('i')
    await helper.wait(30)
    await nvim.input('<c-space>')
    await helper.waitPopup()
    let items = await helper.getItems()
    expect(items.length).toBeGreaterThan(1)
    await helper.wait(300)
  })
  //
  it('should show float window', async () => {
    await helper.edit()
    let source: ISource = {
      name: 'float',
      priority: 10,
      enable: true,
      sourceType: SourceType.Native,
      doComplete: (): Promise<CompleteResult> => Promise.resolve({
        items: [{ word: 'foo', info: 'bar' }]
      })
    }
    disposables.push(sources.addSource(source))
    await nvim.input('i')
    await helper.wait(30)
    await nvim.input('f')
    await helper.waitPopup()
    await nvim.eval('feedkeys("\\<down>","in")')
    await helper.wait(800)
    let hasFloat = await nvim.call('coc#float#has_float')
    expect(hasFloat).toBe(1)
    let res = await helper.visible('foo', 'float')
    expect(res).toBe(true)
  })
  //
  it('should trigger on triggerPatterns', async () => {
    await helper.edit()
    let source: ISource = {
      name: 'pattern',
      priority: 10,
      enable: true,
      sourceType: SourceType.Native,
      triggerPatterns: [/\w+\.$/],
      doComplete: async (): Promise<CompleteResult> => Promise.resolve({
        items: [{ word: 'foo' }]
      })
    }
    disposables.push(sources.addSource(source))
    await nvim.input('i')
    await helper.wait(10)
    await nvim.input('.')
    await helper.wait(30)
    let pumvisible = await nvim.call('pumvisible')
    expect(pumvisible).toBe(0)
    await nvim.input('a')
    await helper.wait(30)
    await nvim.input('.')
    await helper.waitPopup()
    let res = await helper.visible('foo', 'pattern')
    expect(res).toBe(true)
  })
  //
  it('should not trigger triggerOnly source', async () => {
    await helper.edit()
    await nvim.setLine('foo bar')
    let source: ISource = {
      name: 'pattern',
      triggerOnly: true,
      priority: 10,
      enable: true,
      sourceType: SourceType.Native,
      triggerPatterns: [/^From:\s*/],
      doComplete: async (): Promise<CompleteResult> => Promise.resolve({
        items: [{ word: 'foo' }]
      })
    }
    disposables.push(sources.addSource(source))
    await nvim.input('o')
    await helper.wait(10)
    await nvim.input('f')
    await helper.wait(10)
    let res = await helper.visible('foo', 'around')
    expect(res).toBe(true)
    let items = await helper.items()
    expect(items.length).toBe(1)
  })
  //
  it('should not trigger when cursor moved', async () => {
    await helper.edit()
    let source: ISource = {
      name: 'trigger',
      priority: 10,
      enable: true,
      sourceType: SourceType.Native,
      triggerCharacters: ['.'],
      doComplete: async (): Promise<CompleteResult> => Promise.resolve({
        items: [{ word: 'foo' }]
      })
    }
    disposables.push(sources.addSource(source))
    await nvim.setLine('.a')
    await nvim.input('A')
    await nvim.eval('feedkeys("\\<bs>")')
    await helper.wait(10)
    await nvim.eval('feedkeys("\\<left>")')
    await helper.wait(200)
    let visible = await nvim.call('pumvisible')
    expect(visible).toBe(0)
  })
  //
  it('should trigger when completion is not completed', async () => {
    await helper.edit()
    let token: CancellationToken
    let source: ISource = {
      name: 'completion',
      priority: 10,
      enable: true,
      sourceType: SourceType.Native,
      triggerCharacters: ['.'],
      doComplete: async (opt, cancellationToken): Promise<CompleteResult> => {
        if (opt.triggerCharacter != '.') {
          token = cancellationToken
          return new Promise<CompleteResult>((resolve, reject) => {
            let timer = setTimeout(() => {
              resolve({ items: [{ word: 'foo' }] })
            }, 200)
            if (cancellationToken.isCancellationRequested) {
              clearTimeout(timer)
              reject(new Error('Cancelled'))
            }
          })
        }
        return Promise.resolve({
          items: [{ word: 'bar' }]
        })
      }
    }
    disposables.push(sources.addSource(source))
    await nvim.input('if')
    await helper.wait(100)
    await nvim.input('.')
    await helper.visible('bar', 'completion')
    expect(token.isCancellationRequested).toBe(true)
  })
  //
  it('should limit results for low priority source', async () => {
    await helper.edit()
    helper.updateConfiguration('suggest.lowPrioritySourceLimit', 2)
    await nvim.setLine('filename filepath find filter findIndex')
    await helper.wait(200)
    await nvim.input('of')
    await helper.waitPopup()
    let items = await helper.getItems()
    helper.updateConfiguration('suggest.lowPrioritySourceLimit', null)
    items = items.filter(o => o.menu == '[A]')
    expect(items.length).toBe(2)
  })
  //
  it('should limit result for high priority source', async () => {
    helper.updateConfiguration('suggest.highPrioritySourceLimit', 2)
    await helper.edit()
    let source: ISource = {
      name: 'high',
      priority: 90,
      enable: true,
      sourceType: SourceType.Native,
      triggerCharacters: ['.'],
      doComplete: async (): Promise<CompleteResult> => Promise.resolve({
        items: ['filename', 'filepath', 'filter', 'file'].map(key => ({ word: key }))
      })
    }
    disposables.push(sources.addSource(source))
    await nvim.input('i')
    await helper.wait(30)
    await nvim.input('.')
    await helper.waitPopup()
    let items = await helper.getItems()
    helper.updateConfiguration('suggest.highPrioritySourceLimit', null)
    expect(items.length).toBeGreaterThan(1)
  })
  //
  it('should truncate label of complete items', async () => {
    helper.updateConfiguration('suggest.labelMaxLength', 10)
    await helper.edit()
    let source: ISource = {
      name: 'high',
      priority: 90,
      enable: true,
      sourceType: SourceType.Native,
      triggerCharacters: ['.'],
      doComplete: async (): Promise<CompleteResult> => Promise.resolve({
        items: ['a', 'b', 'c', 'd'].map(key => ({ word: key.repeat(20) }))
      })
    }
    disposables.push(sources.addSource(source))
    await nvim.input('i')
    await helper.wait(30)
    await nvim.input('.')
    await helper.waitPopup()
    helper.updateConfiguration('suggest.labelMaxLength', 200)
    let items = await helper.getItems()
    for (let item of items) {
      expect(item.abbr.length).toBeLessThanOrEqual(10)
    }
  })
  //
  it('should delete previous items if complete item is null', async () => {
    await helper.edit()
    let source1: ISource = {
      name: 'source1',
      priority: 90,
      enable: true,
      sourceType: SourceType.Native,
      triggerCharacters: ['.'],
      doComplete: async (): Promise<CompleteResult> => Promise.resolve({
        items: [{ word: 'foo', dup: 1 }]
      })
    }
    let source2: ISource = {
      name: 'source2',
      priority: 90,
      enable: true,
      sourceType: SourceType.Native,
      triggerCharacters: ['.'],
      doComplete: async (opt: CompleteOption): Promise<CompleteResult> => {
        let result: CompleteResult = opt.input == 'foo' ? null : {
          items: [{ word: 'foo', dup: 1 }], isIncomplete: true
        }
        return Promise.resolve(result)
      }
    }
    disposables.push(sources.addSource(source1))
    disposables.push(sources.addSource(source2))
    await nvim.input('i')
    await helper.wait(30)
    await nvim.input('.f')
    await helper.waitPopup()
    let items = await helper.getItems()
    expect(items.length).toEqual(2)
    await nvim.input('oo')
    await helper.waitPopup()
    items = await helper.getItems()
    expect(items.length).toEqual(1)
    expect(items[0].word).toBe('foo')
  })

  it('should indent lines on TextChangedP #1', async () => {
    await helper.createDocument()
    await helper.mockFunction('MyIndentExpr', 0)
    await nvim.command('setl indentexpr=MyIndentExpr()')
    await nvim.command('setl indentkeys=\\=~end,0\\=\\\\item')
    let source: ISource = {
      name: 'source1',
      priority: 90,
      enable: true,
      sourceType: SourceType.Native,
      doComplete: async (): Promise<CompleteResult> => Promise.resolve({
        items: [
          { word: 'item' },
          { word: 'items' },
          { word: 'END' },
          { word: 'ENDIF' }
        ]
      })
    }
    disposables.push(sources.addSource(source))
    await nvim.input('i')
    await helper.wait(30)
    await nvim.input('  \\ite')
    await helper.waitPopup()
    await nvim.input('m')
    await helper.wait(300)
    let line = await nvim.line
    expect(line).toBe('\\item')
    await nvim.input('<cr>')
    await helper.wait(30)
    await nvim.input('  END')
    await helper.wait(300)
    line = await nvim.line
    expect(line).toBe('END')
  })
})
