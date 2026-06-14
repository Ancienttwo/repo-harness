# Trading Terminal 架构推荐 (2026)

专业交易终端结合 TUI 实时渲染能力与金融数据流，提供低延迟、高信息密度的交易界面。

### 技术栈选型对比

| 技术栈 | 语言 | 延迟 | 跨平台 | 适用场景 |
|--------|------|------|--------|----------|
| **OpenTUI + React/Solid** | TypeScript | ~3ms | ✅ | AI Agent集成、Claude Code扩展 ⭐推荐 |
| **Ratatui + Tokio** | Rust | <1ms | ✅ | 高频交易、极致低延迟 |
| **Textual** | Python | ~10ms | ✅ | 快速原型、Python生态集成 |
| **Ink + React** | TypeScript | ~5ms | ✅ | Node.js生态、成熟稳定 |
| **Bubble Tea** | Go | ~2ms | ✅ | 并发友好、部署简单 |

### 推荐架构一: OpenTUI + TypeScript (AI Trading Terminal) ⭐

**为什么选择 OpenTUI:**
- [OpenTUI](https://github.com/sst/opentui) 是 OpenCode (SST开源Claude Code替代) 的底层框架
- React/Solid 组件化开发，前端团队友好
- 内置 console 覆盖层，捕获所有输出
- 与 Claude Agent SDK 深度集成
- 适合构建 AI 辅助交易终端

**项目结构:**

```text
trading-terminal/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.tsx
│   ├── components/
│   │   ├── OrderBook.tsx      # 订单簿组件
│   │   ├── Ticker.tsx         # 行情报价
│   │   ├── Chart.tsx          # K线图
│   │   ├── Positions.tsx      # 持仓显示
│   │   └── TradeInput.tsx     # 交易输入
│   ├── hooks/
│   │   ├── useWebSocket.ts    # WS数据流
│   │   ├── useOrderBook.ts    # 订单簿状态
│   │   └── useTrade.ts        # 交易操作
│   ├── services/
│   │   ├── exchange.ts        # 交易所API
│   │   └── agent.ts           # Claude Agent集成
│   └── utils/
│       └── format.ts          # 数据格式化
└── tests/
```

**核心代码示例:**

```tsx
// src/index.tsx
import { render, Box, Text, useInput, useState, useEffect } from '@opentui/react'
import { OrderBook } from './components/OrderBook'
import { Ticker } from './components/Ticker'
import { useWebSocket } from './hooks/useWebSocket'

function TradingTerminal() {
  const [symbol, setSymbol] = useState('BTC/USDT')
  const { ticker, orderbook } = useWebSocket(symbol)
  const [selectedPanel, setSelectedPanel] = useState<'orderbook' | 'chart'>('orderbook')

  useInput((input, key) => {
    if (input === 'q') process.exit(0)
    if (input === 'b') handleBuy()
    if (input === 's') handleSell()
    if (key.tab) setSelectedPanel(p => p === 'orderbook' ? 'chart' : 'orderbook')
  })

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {/* 顶部: 行情报价 */}
      <Box borderStyle="round" borderColor="cyan">
        <Ticker data={ticker} />
      </Box>

      {/* 中部: 主面板 */}
      <Box flexGrow={1} flexDirection="row">
        <Box width="50%" borderStyle="round" borderColor="green">
          <OrderBook data={orderbook} />
        </Box>
        <Box width="50%" borderStyle="round" borderColor="yellow">
          <Text>📊 Chart Panel</Text>
        </Box>
      </Box>

      {/* 底部: 快捷键提示 */}
      <Box>
        <Text dimColor>
          [b] Buy  [s] Sell  [Tab] Switch  [q] Quit
        </Text>
      </Box>
    </Box>
  )
}

render(<TradingTerminal />)
```

```tsx
// src/components/OrderBook.tsx
import { Box, Text } from '@opentui/react'

interface OrderBookProps {
  data: {
    bids: [number, number][]
    asks: [number, number][]
    spread: number
  }
}

export function OrderBook({ data }: OrderBookProps) {
  return (
    <Box flexDirection="column">
      <Text bold color="yellow">Order Book (Spread: {data.spread.toFixed(2)})</Text>

      {/* 卖盘 */}
      <Box flexDirection="column">
        {data.asks.slice(0, 10).reverse().map(([price, qty], i) => (
          <Box key={i}>
            <Text color="red">{price.toFixed(2).padStart(12)}</Text>
            <Text> {qty.toFixed(4).padStart(10)}</Text>
          </Box>
        ))}
      </Box>

      <Text color="cyan">{'─'.repeat(24)}</Text>

      {/* 买盘 */}
      <Box flexDirection="column">
        {data.bids.slice(0, 10).map(([price, qty], i) => (
          <Box key={i}>
            <Text color="green">{price.toFixed(2).padStart(12)}</Text>
            <Text> {qty.toFixed(4).padStart(10)}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
```

```tsx
// src/hooks/useWebSocket.ts
import { useState, useEffect } from '@opentui/react'

export function useWebSocket(symbol: string) {
  const [ticker, setTicker] = useState({ price: 0, change24h: 0 })
  const [orderbook, setOrderbook] = useState({ bids: [], asks: [], spread: 0 })

  useEffect(() => {
    const ws = new WebSocket(
      `wss://stream.binance.com:9443/ws/${symbol.toLowerCase().replace('/', '')}@depth@100ms`
    )

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      setOrderbook(prev => ({
        bids: data.bids?.slice(0, 20) || prev.bids,
        asks: data.asks?.slice(0, 20) || prev.asks,
        spread: calculateSpread(data)
      }))
    }

    return () => ws.close()
  }, [symbol])

  return { ticker, orderbook }
}
```

**package.json:**

```json
{
  "name": "trading-terminal",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "start": "tsx src/index.tsx",
    "build": "tsup src/index.tsx --format esm"
  },
  "dependencies": {
    "@opentui/core": "^0.1.70",
    "@opentui/react": "^0.1.70",
    "ccxt": "^4.4.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "tsup": "^8.3.0",
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0"
  }
}
```

**与 Claude Agent SDK 集成 (AI 辅助交易):**

```tsx
// src/services/agent.ts
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function analyzeMarket(orderbook: any, positions: any) {
  const response = await client.messages.create({
    model: 'claude-opus-4-20250514',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `分析当前市场状态:
订单簿: ${JSON.stringify(orderbook)}
持仓: ${JSON.stringify(positions)}

给出交易建议和风险提示。`
    }]
  })

  return response.content[0].text
}
```

### 推荐架构二: Ratatui + Rust (高频交易终端)

**为什么选择 Rust:**
- 内存安全，无 GC 停顿
- 毫秒级渲染延迟
- 原生异步支持 (Tokio)
- 与交易所 WebSocket 完美配合
- 可编译为单一二进制，部署简单

**项目结构:**

```text
trading-terminal/
├── Cargo.toml
├── src/
│   ├── main.rs
│   ├── app/
│   │   ├── mod.rs
│   │   ├── state.rs           # 应用状态管理
│   │   └── events.rs          # 事件处理
│   ├── ui/
│   │   ├── mod.rs
│   │   ├── layout.rs          # 布局定义
│   │   ├── widgets/
│   │   │   ├── orderbook.rs   # 订单簿组件
│   │   │   ├── chart.rs       # K线图组件
│   │   │   ├── trades.rs      # 成交记录
│   │   │   ├── positions.rs   # 持仓显示
│   │   │   └── ticker.rs      # 行情报价
│   │   └── theme.rs           # 主题样式
│   ├── data/
│   │   ├── mod.rs
│   │   ├── websocket.rs       # WS连接管理
│   │   ├── orderbook.rs       # 订单簿数据结构
│   │   └── candles.rs         # K线数据
│   ├── trading/
│   │   ├── mod.rs
│   │   ├── orders.rs          # 订单管理
│   │   ├── positions.rs       # 持仓管理
│   │   └── risk.rs            # 风控逻辑
│   └── config/
│       ├── mod.rs
│       └── keys.rs            # API密钥管理
└── tests/
```

**Cargo.toml 依赖:**

```toml
[package]
name = "trading-terminal"
version = "0.1.0"
edition = "2024"

[dependencies]
# TUI 框架
ratatui = "0.29"
crossterm = "0.28"

# 异步运行时
tokio = { version = "1", features = ["full"] }
tokio-tungstenite = "0.24"  # WebSocket

# 数据处理
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rust_decimal = "1"          # 精确小数
chrono = "0.4"

# 交易所 API
ccxt = "0.1"                # 或使用原生 SDK

# 图表
tui-widget-list = "0.12"

# 配置
config = "0.14"
dotenvy = "0.15"

# 日志
tracing = "0.1"
tracing-subscriber = "0.3"

[profile.release]
lto = true
codegen-units = 1
panic = "abort"
```

**核心代码示例:**

```rust
// src/main.rs
use std::io;
use crossterm::{
    event::{self, Event, KeyCode, KeyEventKind},
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
    ExecutableCommand,
};
use ratatui::{prelude::*, widgets::*};
use tokio::sync::mpsc;

mod app;
mod data;
mod ui;

use app::App;
use data::MarketData;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 初始化终端
    enable_raw_mode()?;
    io::stdout().execute(EnterAlternateScreen)?;
    let mut terminal = Terminal::new(CrosstermBackend::new(io::stdout()))?;

    // 创建数据通道
    let (tx, mut rx) = mpsc::unbounded_channel::<MarketData>();

    // 启动 WebSocket 数据流
    let ws_handle = tokio::spawn(data::start_websocket(tx, "wss://stream.binance.com:9443/ws/btcusdt@depth@100ms"));

    // 运行应用
    let mut app = App::new();
    let result = run_app(&mut terminal, &mut app, &mut rx).await;

    // 清理
    disable_raw_mode()?;
    io::stdout().execute(LeaveAlternateScreen)?;

    result
}

async fn run_app<B: Backend>(
    terminal: &mut Terminal<B>,
    app: &mut App,
    rx: &mut mpsc::UnboundedReceiver<MarketData>,
) -> anyhow::Result<()> {
    loop {
        // 处理市场数据更新
        while let Ok(data) = rx.try_recv() {
            app.update_market_data(data);
        }

        // 渲染 UI
        terminal.draw(|frame| ui::render(frame, app))?;

        // 处理键盘输入 (非阻塞)
        if event::poll(std::time::Duration::from_millis(16))? {
            if let Event::Key(key) = event::read()? {
                if key.kind == KeyEventKind::Press {
                    match key.code {
                        KeyCode::Char('q') => return Ok(()),
                        KeyCode::Char('b') => app.place_buy_order(),
                        KeyCode::Char('s') => app.place_sell_order(),
                        KeyCode::Tab => app.next_tab(),
                        KeyCode::Up => app.scroll_up(),
                        KeyCode::Down => app.scroll_down(),
                        _ => {}
                    }
                }
            }
        }
    }
}
```

```rust
// src/ui/widgets/orderbook.rs
use ratatui::{prelude::*, widgets::*};
use rust_decimal::Decimal;

pub struct OrderBook {
    pub bids: Vec<(Decimal, Decimal)>,  // (price, quantity)
    pub asks: Vec<(Decimal, Decimal)>,
    pub spread: Decimal,
}

impl Widget for &OrderBook {
    fn render(self, area: Rect, buf: &mut Buffer) {
        let chunks = Layout::vertical([
            Constraint::Length(1),  // Header
            Constraint::Min(0),     // Orders
        ]).split(area);

        // Header
        Paragraph::new(format!("Spread: {:.2}", self.spread))
            .style(Style::default().fg(Color::Yellow))
            .render(chunks[0], buf);

        // 分割买卖盘
        let order_chunks = Layout::horizontal([
            Constraint::Percentage(50),
            Constraint::Percentage(50),
        ]).split(chunks[1]);

        // 卖盘 (红色，价格降序)
        let ask_items: Vec<ListItem> = self.asks.iter()
            .rev()
            .take(10)
            .map(|(price, qty)| {
                ListItem::new(format!("{:>12.2} {:>10.4}", price, qty))
                    .style(Style::default().fg(Color::Red))
            })
            .collect();

        List::new(ask_items)
            .block(Block::default().title("Asks").borders(Borders::ALL))
            .render(order_chunks[0], buf);

        // 买盘 (绿色，价格降序)
        let bid_items: Vec<ListItem> = self.bids.iter()
            .take(10)
            .map(|(price, qty)| {
                ListItem::new(format!("{:>12.2} {:>10.4}", price, qty))
                    .style(Style::default().fg(Color::Green))
            })
            .collect();

        List::new(bid_items)
            .block(Block::default().title("Bids").borders(Borders::ALL))
            .render(order_chunks[1], buf);
    }
}
```

```rust
// src/data/websocket.rs
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use futures_util::StreamExt;

pub async fn start_websocket(
    tx: mpsc::UnboundedSender<MarketData>,
    url: &str,
) -> anyhow::Result<()> {
    let (ws_stream, _) = connect_async(url).await?;
    let (_, mut read) = ws_stream.split();

    while let Some(msg) = read.next().await {
        match msg? {
            Message::Text(text) => {
                if let Ok(data) = serde_json::from_str::<MarketData>(&text) {
                    let _ = tx.send(data);
                }
            }
            Message::Ping(payload) => {
                // 自动 pong 处理
            }
            _ => {}
        }
    }
    Ok(())
}
```

### 备选方案: Python Textual

适合快速开发和 Python 量化生态集成:

```python
# trading_terminal.py
from textual.app import App, ComposeResult
from textual.containers import Container, Horizontal, Vertical
from textual.widgets import Header, Footer, Static, DataTable, Sparkline
from textual.reactive import reactive
import asyncio
import ccxt.async_support as ccxt

class OrderBookWidget(Static):
    """实时订单簿组件"""

    bids: reactive[list] = reactive([])
    asks: reactive[list] = reactive([])

    def compose(self) -> ComposeResult:
        yield DataTable(id="orderbook")

    def on_mount(self) -> None:
        table = self.query_one("#orderbook", DataTable)
        table.add_columns("Price", "Size", "Total")

    def watch_bids(self, bids: list) -> None:
        self._update_table()

    def watch_asks(self, asks: list) -> None:
        self._update_table()

    def _update_table(self) -> None:
        table = self.query_one("#orderbook", DataTable)
        table.clear()

        # 显示卖盘 (红色)
        for price, size in self.asks[:10]:
            table.add_row(
                f"[red]{price:.2f}[/red]",
                f"{size:.4f}",
                f"{price * size:.2f}"
            )

        # 分隔线
        table.add_row("---", "SPREAD", "---")

        # 显示买盘 (绿色)
        for price, size in self.bids[:10]:
            table.add_row(
                f"[green]{price:.2f}[/green]",
                f"{size:.4f}",
                f"{price * size:.2f}"
            )

class TickerWidget(Static):
    """行情报价组件"""

    price: reactive[float] = reactive(0.0)
    change_24h: reactive[float] = reactive(0.0)
    volume_24h: reactive[float] = reactive(0.0)

    def render(self) -> str:
        color = "green" if self.change_24h >= 0 else "red"
        return f"""
BTC/USDT
Price: [{color}]${self.price:,.2f}[/{color}]
24h:   [{color}]{self.change_24h:+.2f}%[/{color}]
Vol:   {self.volume_24h:,.0f} BTC
"""

class TradingTerminal(App):
    """主交易终端应用"""

    CSS = """
    Screen {
        layout: grid;
        grid-size: 3 2;
        grid-gutter: 1;
    }

    #ticker { column-span: 1; }
    #orderbook { column-span: 1; }
    #chart { column-span: 1; }
    #positions { column-span: 2; }
    #trades { column-span: 1; }
    """

    BINDINGS = [
        ("q", "quit", "Quit"),
        ("b", "buy", "Buy"),
        ("s", "sell", "Sell"),
        ("r", "refresh", "Refresh"),
    ]

    def compose(self) -> ComposeResult:
        yield Header()
        yield TickerWidget(id="ticker")
        yield OrderBookWidget(id="orderbook")
        yield Static("📊 Chart", id="chart")
        yield DataTable(id="positions")
        yield DataTable(id="trades")
        yield Footer()

    async def on_mount(self) -> None:
        # 启动数据更新任务
        self.exchange = ccxt.binance()
        asyncio.create_task(self._update_ticker())
        asyncio.create_task(self._update_orderbook())

    async def _update_ticker(self) -> None:
        ticker_widget = self.query_one("#ticker", TickerWidget)
        while True:
            try:
                ticker = await self.exchange.fetch_ticker("BTC/USDT")
                ticker_widget.price = ticker['last']
                ticker_widget.change_24h = ticker['percentage']
                ticker_widget.volume_24h = ticker['baseVolume']
            except Exception as e:
                self.log.error(f"Ticker error: {e}")
            await asyncio.sleep(1)

    async def _update_orderbook(self) -> None:
        ob_widget = self.query_one("#orderbook", OrderBookWidget)
        while True:
            try:
                orderbook = await self.exchange.fetch_order_book("BTC/USDT", limit=20)
                ob_widget.bids = orderbook['bids']
                ob_widget.asks = orderbook['asks']
            except Exception as e:
                self.log.error(f"OrderBook error: {e}")
            await asyncio.sleep(0.5)

    def action_buy(self) -> None:
        self.notify("Buy order dialog", severity="information")

    def action_sell(self) -> None:
        self.notify("Sell order dialog", severity="warning")

if __name__ == "__main__":
    app = TradingTerminal()
    app.run()
```

**pyproject.toml:**

```toml
[project]
name = "trading-terminal"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "textual>=0.89.0",
    "ccxt>=4.4.0",
    "rich>=13.9.0",
    "pandas>=2.2.0",
    "numpy>=2.0.0",
]

[project.scripts]
trading = "trading_terminal:main"

[tool.ruff]
line-length = 100
target-version = "py311"
```

### 备选方案: Go Bubble Tea

适合需要高并发和简单部署:

```go
// main.go
package main

import (
    "fmt"
    "log"
    "time"

    tea "github.com/charmbracelet/bubbletea"
    "github.com/charmbracelet/lipgloss"
)

type model struct {
    ticker    TickerData
    orderbook OrderBook
    width     int
    height    int
}

type TickerData struct {
    Symbol    string
    Price     float64
    Change24h float64
}

type OrderBook struct {
    Bids [][]float64
    Asks [][]float64
}

type tickerMsg TickerData
type orderbookMsg OrderBook

func (m model) Init() tea.Cmd {
    return tea.Batch(
        tickTicker(),
        tickOrderbook(),
    )
}

func tickTicker() tea.Cmd {
    return tea.Tick(time.Second, func(t time.Time) tea.Msg {
        // 实际应从 WebSocket 获取
        return tickerMsg{
            Symbol:    "BTC/USDT",
            Price:     67890.50,
            Change24h: 2.35,
        }
    })
}

func tickOrderbook() tea.Cmd {
    return tea.Tick(500*time.Millisecond, func(t time.Time) tea.Msg {
        // 实际应从 WebSocket 获取
        return orderbookMsg{}
    })
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
    switch msg := msg.(type) {
    case tea.KeyMsg:
        switch msg.String() {
        case "q", "ctrl+c":
            return m, tea.Quit
        case "b":
            // 买入逻辑
        case "s":
            // 卖出逻辑
        }
    case tea.WindowSizeMsg:
        m.width = msg.Width
        m.height = msg.Height
    case tickerMsg:
        m.ticker = TickerData(msg)
        return m, tickTicker()
    case orderbookMsg:
        m.orderbook = OrderBook(msg)
        return m, tickOrderbook()
    }
    return m, nil
}

var (
    priceStyle = lipgloss.NewStyle().
        Bold(true).
        Foreground(lipgloss.Color("10"))  // Green

    askStyle = lipgloss.NewStyle().
        Foreground(lipgloss.Color("9"))   // Red

    bidStyle = lipgloss.NewStyle().
        Foreground(lipgloss.Color("10"))  // Green

    boxStyle = lipgloss.NewStyle().
        BorderStyle(lipgloss.RoundedBorder()).
        BorderForeground(lipgloss.Color("62")).
        Padding(1, 2)
)

func (m model) View() string {
    ticker := boxStyle.Render(fmt.Sprintf(
        "%s\nPrice: %s\n24h: %.2f%%",
        m.ticker.Symbol,
        priceStyle.Render(fmt.Sprintf("$%.2f", m.ticker.Price)),
        m.ticker.Change24h,
    ))

    orderbook := boxStyle.Render("Order Book\n...")

    return lipgloss.JoinHorizontal(lipgloss.Top, ticker, orderbook)
}

func main() {
    p := tea.NewProgram(model{}, tea.WithAltScreen())
    if _, err := p.Run(); err != nil {
        log.Fatal(err)
    }
}
```

### Trading Terminal 功能清单

```text
核心功能:
┌─────────────────────────────────────────────────────────────┐
│  📊 市场数据                                                 │
│  ├── 实时订单簿 (深度图可视化)                               │
│  ├── K线图表 (多时间周期)                                    │
│  ├── 成交流 (时间与销售)                                     │
│  ├── 多交易对 Ticker                                        │
│  └── 资金费率/基差显示                                       │
├─────────────────────────────────────────────────────────────┤
│  💼 交易功能                                                 │
│  ├── 限价/市价/止损单                                        │
│  ├── 一键平仓                                               │
│  ├── 批量下单                                               │
│  ├── 条件单/OCO                                             │
│  └── 快捷键下单                                             │
├─────────────────────────────────────────────────────────────┤
│  📈 持仓管理                                                 │
│  ├── 多账户汇总                                             │
│  ├── 未实现盈亏                                             │
│  ├── 保证金使用率                                           │
│  ├── 强平价格计算                                           │
│  └── 持仓历史                                               │
├─────────────────────────────────────────────────────────────┤
│  ⚠️ 风控模块                                                 │
│  ├── 最大持仓限制                                           │
│  ├── 单笔最大亏损                                           │
│  ├── 日亏损熔断                                             │
│  ├── 价格偏离告警                                           │
│  └── API 调用频率监控                                       │
├─────────────────────────────────────────────────────────────┤
│  🔧 系统功能                                                 │
│  ├── 多交易所支持                                           │
│  ├── 主题切换 (暗色/亮色)                                    │
│  ├── 布局自定义                                             │
│  ├── 快捷键配置                                             │
│  └── 本地日志导出                                           │
└─────────────────────────────────────────────────────────────┘
```

### 键盘快捷键设计

```text
Trading Terminal 快捷键:

全局:
  q / Ctrl+C    退出
  Tab           切换面板
  1-9           切换交易对
  /             命令模式
  ?             帮助

交易:
  b             买入对话框
  s             卖出对话框
  B (Shift+b)   市价买入
  S (Shift+s)   市价卖出
  x             取消所有订单
  p             一键平仓

导航:
  ↑/↓/j/k       滚动
  h/l           左右面板
  [/]           缩放图表
  +/-           调整数量

视图:
  F1            订单簿视图
  F2            图表视图
  F3            持仓视图
  F4            历史记录
  t             切换主题
```

### 推荐开源项目参考

| 项目 | 语言 | 特点 |
|------|------|------|
| **[cointop](https://github.com/cointop-finance/cointop)** | Go | 加密货币行情终端 |
| **[ticker](https://github.com/achannarasappa/ticker)** | Go | 股票行情终端 |
| **[mop](https://github.com/mop-tracker/mop)** | Go | 股票追踪器 |
| **[gobang](https://github.com/TaKO8Ki/gobang)** | Rust | 数据库 TUI (Ratatui) |
| **[bottom](https://github.com/ClementTsang/bottom)** | Rust | 系统监控 (Ratatui) |
| **[gitui](https://github.com/extrawurst/gitui)** | Rust | Git TUI (Ratatui) |

### 技术栈选择建议

| 场景 | 推荐 | 原因 |
|------|------|------|
| **AI辅助交易** | OpenTUI (TypeScript) ⭐ | Claude Agent集成，React开发体验 |
| **HFT / 低延迟** | Ratatui (Rust) | 亚毫秒渲染，无 GC |
| **快速原型** | Textual (Python) | 开发速度，Python量化生态 |
| **部署简单** | Bubble Tea (Go) | 单二进制，交叉编译 |
| **团队熟悉 JS** | OpenTUI/Ink (React) | React 组件化开发 |

---

## 研究来源

### Mobile APP
- [React Native + Expo vs Bare Workflow](https://dev.to/lucas_wade_0596/react-native-expo-vs-bare-workflow-which-should-you-choose-47lo)
- [Expo for React Native 2025](https://hashrocket.com/blog/posts/expo-for-react-native-in-2025-a-perspective)
- [SwiftUI Architecture Patterns](https://curatedios.substack.com/p/20-swiftui-architecture)
- [TCA Guide](https://medium.com/@dmitrylupich/the-composable-architecture-swift-guide-to-tca-c3bf9b2e86ef)
- [Jetpack Compose 2026](https://developer.android.com/compose)
- [Flutter vs React Native 2026](https://www.luciq.ai/blog/flutter-vs-react-native-guide)
- [KMP vs Flutter](https://www.luciq.ai/blog/flutter-vs-kotlin-mutliplatform-guide)

### TUI Terminal
- [OpenTUI GitHub](https://github.com/sst/opentui)
- [Ink - React for CLI](https://github.com/vadimdemedes/ink)
- [Ratatui](https://ratatui.rs/)
- [Tauri 2.0](https://v2.tauri.app/)
- [Electron Performance](https://www.electronjs.org/docs/latest/tutorial/performance)
- [Claude Agent SDK TUI Integration](https://oneryalcin.medium.com/when-claude-cant-ask-building-interactive-tools-for-the-agent-sdk-64ccc89558fa)

### Python 量化金融
- [VeighNa (vnpy)](https://github.com/vnpy/vnpy) - 全栈量化交易平台
- [Polars](https://pola.rs/) - Rust核心高性能DataFrame
- [VectorBT](https://vectorbt.dev/) - 向量化回测引擎
- [QuantStats](https://github.com/ranaroussi/quantstats) - 绩效分析
- [CCXT](https://github.com/ccxt/ccxt) - 统一加密货币交易所API
- [Zipline-Reloaded](https://github.com/stefan-jansen/zipline-reloaded) - 事件驱动回测
- [Arctic](https://github.com/man-group/arctic) - 时序数据存储

### 加密货币量化
- [Freqtrade](https://github.com/freqtrade/freqtrade) - 开源加密货币交易机器人
- [Hummingbot](https://hummingbot.org/) - 做市/套利机器人
- [Jesse](https://jesse.trade/) - 优雅语法的交易框架
- [Cryptofeed](https://github.com/bmoscon/cryptofeed) - 多交易所实时数据归一化
- [CCXT Pro](https://ccxt.pro/) - WebSocket流数据接口
- [Jito Labs](https://www.jito.wtf/) - Solana MEV基础设施

### Trading Terminal
- [OpenTUI](https://github.com/sst/opentui) - SST开源TUI框架 (OpenCode底层)
- [Ratatui](https://ratatui.rs/) - Rust TUI 框架
- [Textual](https://textual.textualize.io/) - Python 现代 TUI 框架
- [Bubble Tea](https://github.com/charmbracelet/bubbletea) - Go TUI 框架
- [Lip Gloss](https://github.com/charmbracelet/lipgloss) - Go TUI 样式库
- [cointop](https://github.com/cointop-finance/cointop) - 加密货币行情终端
- [ticker](https://github.com/achannarasappa/ticker) - 股票行情终端
