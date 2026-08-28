# Operator board：attention-first worklist 的可复用结论

来源：`plans/plan-20260828-2326-operator-board-redesign.md`，PR #220（merge 77ad435f）。
本文只记录可复用结论，过程与逐条 slice 决策留在
`tasks/notes/20260828-2326-operator-board-redesign.notes.md`。

## Kanban 对只读推导面是错误隐喻

Operator board 渲染的每一列都是从 Fleet snapshot 推导出来的状态，人类不能把卡片从一列拖到另一列——
拖动在这个面上没有对应的写入语义。Kanban 的价值在于「列即人可改的状态」，这个前提不成立时，
它只剩下把注意力平摊到所有列的代价。

对只读推导面，正确的 IA 是 attention-first：**单一优先级排序 worklist + 常驻 detail pane**。
worklist 按「谁被挡住」排序而不是按状态分组，detail pane 常驻使得选中一行不需要导航跳转。
排序键取自每条 blocker 的 `attention_owner`，不是扁平的 blocker code 列表——
owner 才决定这一行是否属于人类，code 只说明是什么。

一个附带约束：分组的**赋值顺序**和**显示顺序**要分开。显示顺序服务人类扫读，
赋值顺序要保证「系统无法分类的卡片」优先落进不会被默认折叠的组，
否则一张 Fleet 没能分类的卡会被 UI 静默藏起来。

## observe-only + 恰好一个写入，需要两道守卫

这个面的边界是「只观察，加恰好一个写入动作」。这条边界靠视觉纪律维持不住，
它必须是测试面。落地的形式是两道互补的守卫：

1. **CSS token 面**：`styles.css` 里每一条用到 `var(--carrot-*)` 的规则，选择器必须以
   `.composer__` 开头——accent 只能落在那唯一一个写入组件上。
2. **tsx hex 面**：`src/operator-web/*.tsx` 里不得出现品牌橙的裸 hex 字面量，
   白名单恰好一项：`marks.tsx`。

两道守卫方向不同——第一道防「accent 经 token 被复用到非写入 affordance」，
第二道防「绕开 token 直接写色值」。只有一道时，另一条路径就是敞开的。

第二道守卫还反向断言白名单文件里确实存在品牌橙，
否则品牌美术被改掉之后，这个白名单会变成一个没人注意到的常开缺口。

## Brand art 是 accent 纪律的具名例外

品牌标记和吉祥物携带的是品牌色，不是 UI 语义色。它们不服从「accent 只给人类写入动作」这条规则，
因为它们根本不是 affordance（全部 `aria-hidden`，纯装饰）。

处理方式是把例外**具名**：所有品牌美术集中在 `marks.tsx` 一个文件，守卫测试白名单只列这一个路径。
例外一旦有名字，就不会扩散——下一次想加裸色值的人必须先解释为什么它属于品牌美术。

## Protocol bump 的消费者清单必须包含 scripts/

`FLEET_BOARD_PROTOCOL` 从 1 升到 2 时，`src/` 和 `tests/` 的消费者都扫到了，
漏掉的是 `scripts/check-tarball-install-smoke.sh`——它对 fleet snapshot payload 做断言，
是一个在 CI 里才会暴露的消费者。

结论：任何 protocol 常量的 bump，扫描面是 `src/` + `tests/` + **`scripts/`**。
构建脚本、smoke 脚本、打包校验脚本都可能是 payload 的消费者，而它们通常不在 IDE 的引用搜索结果里。

## task_label 是 sprint row 的原像投影，不是第二权威

`task_label` / `task_index` 加进 `FleetBoardCardV1` 时，它们是 sprint row 已有单元格的**投影**，
不是 board 自己维护的一份标签数据。collector 把「没有 canonical row」还原成 `null`
（而不是转发空字符串），于是 `task_label: null` 是一个 snapshot 事实，
而不是「有 label 但渲染不出来」的占位符。

判据是：任何加进 snapshot 的人类可读字段，要么能追溯到唯一原像并在原像缺失时诚实地为 null，
要么它就是新的一份权威，需要自己的一致性检查。前者是投影，后者是债。

## 相关

- Board 的产品定位与 Fleet 协议边界见
  `docs/researches/20260823-human-control-board-agentic-factory.md`。
- 设计文档：`docs/design/DESIGN-local-human-control-board-v1.md`。
