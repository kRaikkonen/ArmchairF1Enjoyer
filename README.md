
# F1 Armchair Pitwall

<img width="1177" height="912" alt="4f151d09c07eaa19e5d65c80c9067b0" src="https://github.com/user-attachments/assets/867df02a-eb92-4121-a847-4bdde56085ce" />


一个基于 FastF1 真实数据拟合的 F1 策略推演玩具。
选一场比赛、一个车手、一个 What-If（罚时、SC、改进站），看另一种结局。

**定位：armchair 玩具**，不是 race strategist 工具。
模型求"看起来像 F1"，不求赛车工程师级精度。

---

## 当前状态（2026-04-18）

**覆盖：** 2025 赛季 Bahrain GP 单场
**完成：** Phase 0（数据管道 + 引擎）+ Phase 1（前端 MVP）+ Phase 2 骨架（MFD UI）

### 可以跑起来的东西

- Python 数据管道：FastF1 拉数据 → 清洗 → 拟合 → 回测 → 导出 JSON
- TS 引擎：纯函数、确定性、seeded PRNG、逐圈推演
- 基础前端流程：选比赛 → 选车手 → 选 What-If → 对比视图
- URL 分享链接：同 seed 打开同结果
- MFD 高级模式骨架：三栏布局、Gap Chart（占位数据）、事件条、电台日志

### 已验证的事

- 事件注入真实生效（VER +5s 罚时确实会掉位）
- seeded 确定性：同 URL 打开结果一致
- Phase 0 出口条件全部达标（但见下方"验证债"）

---

## 技术栈

| 层 | 选型 |
|----|------|
| 数据管道 | Python 3.10 · conda env `f1apt` · FastF1 · pandas · scikit-learn · pytest |
| 引擎 | TypeScript strict · 纯函数 · seedrandom · 零外部依赖 |
| 前端 | Vite · React 18 · Zustand · Tailwind · i18next |
| 部署 | 本地开发 · Vercel（未配置） |

---

## 目录结构

```
armchair-pitwall/
├── CLAUDE.md                   # Claude Code 工作守则
├── docs/                       # 物理模型、回测记录、反模式、brief
├── tasks/                      # 阶段任务清单
├── .claude/skills/             # 自定义 skill（引擎纯度守则）
├── pipeline/                   # Python 数据管道
│   ├── src/
│   └── tests/fixtures/         # 离线 parquet + meta.json
├── models/tracks/2025/         # 产出的 TrackModel JSON
├── web/                        # React 前端
│   └── src/engine/             # 纯 TS 引擎（可移植小程序）
└── scripts/verify.sh           # 统一验证入口
```

---

## 快速开始

### 数据管道

```bash
conda activate f1apt
cd pipeline
pytest
python -m src.build_track bahrain 2025
```

### 前端

```bash
cd web
pnpm install
pnpm dev
# 打开 http://localhost:5173/
```

### 验证

```bash
bash scripts/verify.sh
```

---

## 物理模型（简化版）

```
lapTime = trackBasePace
        + stintProgressCoef * lapsSinceStart
        + tyreDeg(team, compound, stintLap)
        + dirtyAirPenalty(gapAhead)
        - drsBoost(inDrsZone, gapAhead)
        + ersDelta(ersMode)
        + driverOffset(driverId)
        + weatherDelta(trackTemp)
        + seededNoise(seed, driver, lap)
```

所有物理参数从 `TrackModel` JSON 读取，不在代码中硬编码。
详细说明见 `docs/physics-model.md`。

---

## 已知局限与验证债（坦白版）

以下问题都是真实存在的，在产品进一步成熟前需要逐项处理。

### 🔴 建模层面

**1. driver offset 用 mean residual 回填**
Bahrain 回测 top3 时间误差 0.0s 不是"模型准"，是**代数恒等式**——
mean residual 保证了总时间精确对齐，这个数字没有独立验证价值。
真实精度未知。

**2. dirty air penalty = 0**
脏气流拟合结果为零，原因是 gap 从累积时间估算精度不足。
产品后果：没有跟车损失物理，超车推演会偏乐观。

**3. 无跨赛道泛化验证**
只用 Bahrain 数据拟合 + Bahrain 数据回测，相当于训练集=测试集。
没做 Saudi holdout 验证，不知道模型能不能外推。

**4. 位置更新基于累积时间，不是物理位置**
简化处理：A 车累积时间小于 B 就排在 B 前面，不管赛道空间位置。
真实 F1 超车是在具体弯道完成的。

**5. AI 静态，不响应场景**
- 贪心 1-stop 算法
- SC 下不会"免费进站"
- 用户改一个车手进站，其他车手策略完全不变
What-If 推演实际退化成"单车模拟"。

**6. 隐性硬编码**
ERS 三档参数（attack -0.15s / 1.5x 预算等）是拍脑袋启发式，不是拟合。
1-stop 限制、pit stop cost 可能也有类似问题，待审计。

**7. DNF 处理不完整**
HAM 真实 DNF，推演显示 P11 ▲8——产品字面语义有误导。
需要显式标注"未建模故障因素"。

### 🟡 工程层面

**8. Python 与 TS 引擎一致性未验证**
Python 回测 max error=1，TS vitest 阈值写的是 ±4 位。
没有 cross-language 数值对比测试。

**9. 噪声是否驱动结果未知**
当前推演里 ANT ▲3、OCO ▲6 这类位次变化，
可能是物理预测，也可能是 seed=42 下的噪声漂移。
没做多 seed 稳定性测试。

**10. modelVersion 未进入分享 URL**
未来模型升级，老链接会默默跑新模型，结果漂移。
破坏"分享的是什么，打开就是什么"的承诺。

**11. URL 事件参数无 schema 校验**
畸形输入可能导致 runtime 崩溃或错误推演。

### 🟢 产品层面

**12. MFD 高级模式尚未接入真实引擎**
Gap Chart、赛道、进站控制台都是占位数据，
"重新推演"按钮未连接。

**13. 未做移动端验证**
只在桌面 1280px+ 开发。

**14. 未做跨浏览器确定性验证**
只在本地 Chrome 测试。

**15. i18n 只做了中文**
英文 keys 未填，即使有语言切换也只有中文可用。

**16. 无部署**
Vercel 未配置，分享链接只能本地用。

---

## 路线图

### 近期（P0 - 还债）

- [ ] 多 seed 稳定性测试（20 个 seed 跑，看位次方差）
- [ ] Saudi 2025 holdout 验证（用 Bahrain 参数预测 Saudi，看误差）
- [ ] DNF 车手从 driver offset 拟合中剔除
- [ ] modelVersion 加入分享 URL
- [ ] Python vs TS 引擎数值一致性测试
- [ ] URL 参数 schema 校验

### 中期（P1 - 产品完整性）

- [ ] MFD 高级模式接入真实引擎
- [ ] 推演动画（逐圈位次变化）
- [ ] AI 响应事件（SC 下免费进站、对手策略博弈）
- [ ] 部署 Vercel
- [ ] 英文 i18n 填完

### 远期（P2 - 扩展）

- [ ] 扩赛道至 8-12 条热门赛道
- [ ] dirty air 重新拟合（用 position data）
- [ ] 轮胎衰减升级到分段模型
- [ ] 移动端优化
- [ ] 微信小程序移植

---

## 开发准则

见 `CLAUDE.md`：
- 物理参数必须从 TrackModel 读取，禁止硬编码
- 禁止 `Math.random()`，必须用 seeded PRNG
- 引擎层禁止 React / DOM / 网络依赖
- 回测不过不上架

---

## 数据来源与致谢

- F1 数据：[FastF1](https://github.com/theOehrly/Fast-F1) 项目
- 本项目与 Formula 1、FIA、任何车队均无关联
- 车手代号、车队简称仅用于识别，无官方授权
- 本项目仅用于学习娱乐，不构成任何赛事预测建议

---

## License

TBD（当前为个人项目，未开源发布）





---

**关于这份 README 的几点说明：**

1. **"验证债"那节是核心**。它用红/黄/绿分级，区分了严重性。三个月后你看自己不会自己骗自己。
2. **路线图按优先级分 P0/P1/P2**。P0 全是"还债"，没有新功能。这是正确的姿势——debt 不还，越加功能越难还。

---

---


---


---












关于“还债”， claude的说法：

---

## 一、最严重的问题:回测是数学恒等式,不是验证

Phase 0 回测报告的数字看着漂亮:

- top5 误差 max=0
- 全场误差 max=1
- top3 时间误差 0.0s

**但 Claude Code 自己在报告里写了真相**:"driver offset 用 mean residual——确保 clean lap 总时间精确"。

这句话的含义被轻描淡写了。它的数学本质是:

```
driver_offset_i = (actual_total_time_i - predicted_total_time_i) / num_clean_laps_i
```

也就是说,先跑一遍预测,然后**对每个车手算出一个偏置,使得预测总时间恒等于真实总时间**。把这个偏置存进模型,再跑回测,**时间误差必然是 0**。不是"模型准",是**代数恒等**。

这等于把答案塞进了模型的自由参数里。top3 时间误差 0.0s 这个数字没有验证价值,它在数学上必须是零。

位次误差 max=1 看起来还行,但这也被这个 bias 保护着——驱动位次变化的是时间差,时间被校准后,位次顺序也被间接校准。真实验证应该是:**用 Bahrain 拟合的参数去预测 Saudi**,看位次误差是多少。没做。

**你现在没有任何证据证明这个模型能泛化到 Bahrain 以外**。

---

## 二、验证债务的连锁反应

**Python 和 TS 引擎是否等价,从未被验证。**

Python 那边回测 max error=1,TS 那边 vitest 写的是"within 4 positions"。差了 4 倍。这个 gap 是因为:
- TS 引擎翻译时引入了 bug?
- 噪声/seed 机制不同?
- 浮点精度差异?
- 还是 vitest 阈值写松了?

没有任何 cross-language 的数值对比测试。**"Python 回测通过"对 TS 引擎产出的结果完全不是保证**。

**噪声可能在驱动"▲3"这种结果**。

你的基准推演显示 ANT ▲3(从实际 P7 跳到模拟 P4)。噪声量级是每圈 ±0.05s,57 圈累计 √57 × 0.05 ≈ 0.38s。P4-P7 真实时间差也就 1-2s 级别。**你有多少把握这个 ▲3 是物理预测,而不是 seed=42 下的噪声漂移?** 换一个 seed,ANT 可能就不 ▲3 了。

验证方法很简单:跑 20 个不同 seed 看位次稳定性。没做。

---

## 三、物理建模的实质性缺陷

**dirty air = 0 意味着没有追击物理。**

脏气流拟合值是 0,这个缺陷被"armchair 精度够"一句话接受了。但它的产品后果严重:

- 两车接近时,不会有跟车损失
- 没有"卡在 1 秒 DRS 区但超不过去"的经典 F1 场面
- What-If"如果 VER 没进站,能不能追回 LEC"这种问题,推演会过度乐观

你的产品核心卖点是策略推演,但模型**不模拟追击的物理张力**。用户问"能追上吗",系统只会用累积时间回答"能"或"不能",不会呈现"追到 1.2 秒然后卡住"。

**位置更新基于累积时间,不是物理位置。**

引擎用 `totalTimeSec` 排名。但 F1 超车是空间性的——必须在具体一圈具体弯道完成。当前逻辑允许"A 车在第 30 圈累积时间少于 B,就自动排在 B 前面",不管 A 实际在赛道哪里、有没有机会完成超车。

**AI 是静态的,不响应场景。**

贪心 1-stop AI:
- SC 在第 20 圈注入,AI 不会"免费进站"(真实 F1 策略的基本操作)
- VER 被罚 5 秒,LEC 不会调整策略去防守/攻击
- 用户改操控车手的进站圈,其他车手完全不反应

这让 What-If 推演**退化成单车模拟**——你改的变量只影响你选的那辆车,其他 19 辆车跑的剧本完全不变。这从产品定位说是软伤——"策略推演"这两个字名不副实。

---

## 四、隐性硬编码

Brief 写得很严:`lapTime.ts` 禁止硬编码物理常数。但实际上:

**ERS 三档参数**:`attack 消耗 1.5x 预算给 -0.15s 增益`,`save 消耗 0.5x`。这些数字**不是从数据拟合的**,是拍脑袋的启发式。但它们进入了圈速公式。这违反了"物理参数必须来自拟合"的硬规则,只是被包装成"armchair 简化"。

**AI 1-stop 限制**:这是后加的 patch,很可能是硬编码的 `maxPitStops = 1`。Brief 里也没写这个约束的来源。

**pit stop cost**:AI 决策里用的"PIT_STOP_TIME"是一个具体数字。是从 Bahrain 真实数据拟合的,还是拍的?报告里没说清楚。

严格讲,当前引擎有多个**"披着参数外衣的硬编码"**。它们通过了 SKILL 里的 grep 检查(`Math.random` 为零),但违反了 SKILL 的精神。

---

## 五、DNF 处理把产品语义搞坏了

HAM 真实 DNF,推演显示 P11 ▲8。产品字面语义:"如果模型预测这个比赛,HAM 会从真实 DNF 提升 8 位到 P11"。

这个推断在用户看来很诱人("哦,不退赛就能 P11!"),但它**无效**——因为:

- DNF 是机械/撞车事件,与策略建模无关
- 模型假设 HAM 正常完赛,但数据里 HAM 只有 DNF 前的几圈
- 用前几圈拟合出的 driver_offset 外推 57 圈是过度外推

正确的产品处理应该是:DNF 车手**要么不在推演里出现**,要么显式标注"若无退赛(本推演未建模故障因素)"。现在的灰色 DNF 条只是视觉分隔,不是语义分隔,用户看到 ▲8 会误读。

---

## 六、起跑位置对结果的约束被忽视

"基准推演的位次与真实接近"听起来像模型准,但实际上:

- P1 起跑的车 90%+ 会在 top3 结束
- 跑得快的车队占前排,跑得慢的垫底
- 真实 2025 Bahrain 的起跑顺序本身就已经编码了大部分结果

**把起跑顺序作为输入,再去预测终点顺序,很大程度上是在"重述输入"**。Claude Code 没有做"乱序起跑 → 看位次预测"这个实验。所以 max_err=1 这个数字里,多少是模型功劳、多少是起跑位置的 prior,**分不清**。

---

## 七、产品完整性缺口

对照 brief,Phase 1 清单:

- ✅ 引擎 + 确定性 + 基础测试
- ✅ 三步选择流 + 对比视图 + URL 分享
- ❌ **推演动画(10秒位次变化)**——报告里没提,结果页是直接跳转
- ❌ **移动端验证**——桌面跑的,没见移动端截图
- ❌ **跨浏览器确定性**——只测了 localhost 单环境
- ❌ **i18n 双语**——UI 里已经有中文,英文 keys 是否真的埋了未知,还是硬编码中文
- ❌ **性能基准**——simulate() 耗时多久?分享链接打开要几秒?没测

---

## 八、技术栈层面的潜在问题

**share link 的 JSON 编码没有签名或版本校验**。

URL 参数里有 `events=[{...JSON...}]`,任何人可以编辑 URL 注入畸形事件。如果 decoder 写得宽松,可能导致 runtime 崩溃或错误推演。没看到对应的防御代码。

**modelVersion 参数在 brief 里提到,实际实现中似乎没出现在 URL**。

Brief 第 2.5 节明确要求 URL 带 modelVersion,确保多版本兼容。Step 4 的 URL 格式里**没看到 modelVersion**。这意味着三个月后你升级了模型,老分享链接会默默跑新模型,结果漂移,用户看到的与当初分享的不一致。

---

## 九、客观说,做对了什么

为了公平:

- **Harness 起了作用**。CLAUDE.md、verify.sh、task 文件、skill 都按预期工作,Phase 1 执行相当直线。
- **事件注入真的生效了**。Test 2 的截图证明 5s 罚时把 VER 从 P5 推到 P6。这不是假的。
- **确定性 seed 工作**。同 URL 打开结果一致。
- **对比视图是对的产品决策**。没有"actual vs simulated"这个界面,What-If 根本没意义。
- **整体进度节奏合理**。两周内从零到可交互原型。

---

## 十、优先修复清单(按 ROI 排序)

**必须修(上线前):**

1. **DNF 逻辑**。推演里把 DNF 车手标注为"未模拟故障",不显示 ▲N。
2. **modelVersion 加入 URL**。没有这个,产品长期维护直接炸。
3. **share URL 的 schema 校验**。防畸形输入。
4. **TS 引擎 vs Python 引擎的数值一致性测试**。至少 Bahrain 同 seed 下位次完全一致。

**应该修(影响产品可信度):**

5. **换 seed 跑 20 次**,报告位次稳定性。当前"▲3"可能是噪声。
6. **跨赛道 holdout 验证**。用 Bahrain 参数预测 Saudi,看误差。有这个数字才敢说模型"能用"。
7. **DNF 拟合处理**。从 clean_laps 清洗阶段就排除 DNF 车手,不要让他们污染 driver_offset 计算。

**可以推迟(Phase 2 再说):**

8. dirty air 重新拟合(需要位置数据而不是时间估算)
9. AI 响应事件(SC 免费进站、对手策略调整)
10. 推演动画
11. 多赛道

---

## 结论

**当前是一个"看起来像样的 demo",不是一个"模型可信的 armchair 工具"**。

严格讲,你现在的 MVP 的核心卖点(对比 actual vs simulated)**建立在一个数学恒等式上**——模型通过 mean residual cheat 保证了对齐真实结果。它展示了功能链路打通,但"推演可信度"这件事没有被真正验证。

你可以继续推进 Phase 2(UI 升级、扩赛道),但**必须承认现在有一份"验证债"**。这份债不还,越往后加功能越难还——因为每加一条赛道、每加一种 What-If,都会有人问"这个推演真的准吗",而你现在没有回答。

**建议的最小还债步骤**:花 1-2 天做第 5、6 两条(多 seed 稳定性 + Saudi holdout 验证),有了这两个数字,你就从"demo"升级到"有弱验证的 armchair 工具",可信度差异非常大。


```
