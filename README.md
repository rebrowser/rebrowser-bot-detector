# 🕵️ Modern tests to detect automated browser behavior

The goal of this repo is to have actual relevant tests that you could use with your automation software to adequately estimate your chances for success in the modern world of web.

There are many pages by different people containing various tests to detect bots. Some of these pages are 5+ years old and target techniques that are not relevant anymore. Some people think that using `puppeteer-extra-plugin-stealth` with all the options on is enough, but unfortunately, many of them are not really relevant to the current state of automation and could even hurt your fingerprints and success rate.

This repo contains tests to detect some really basic stuff which is quite easy to implement on any website. It's guaranteed that all these tests are used by major anti-bot companies in their products. Moreover, each of them has their own proprietary algorithms and ideas on how to test your browser for automation. But 90% of the time when you're getting blocked or see any CAPTCHA, it's just because of these tests below.

If you do any kind of browser automation, you might want to make sure that your setup pass these tests. If it doesn't, then you might not achieve any high success rates for your automation.

⚠️ The recommendation is to take care of all of these tests before you try to find high-quality proxies, adjust your automated behavior, and do any other optimizations with your pipeline. **These tests are crucial** to be passed.

➡️ You can try all the tests on this page: [https://bot-detector.rebrowser.net/](https://bot-detector.rebrowser.net/)

*These tests mainly focus on Chromium automated by Puppeteer and Playwright but could also be useful for testing other automation tools.*

## How to pass all the tests?
Just follow the tips on the page. Some require extra settings, some require patching your Puppeteer or Playwright with [`rebrowser-patches`](https://github.com/rebrowser/rebrowser-patches).

## What are the tests?
Our goal is to keep this list in an actual state. If you would like to suggest any new tests or any adjustments, please open a new issue. Any feedback will be appreciated.

### runtimeEnableLeak
By default, Puppeteer, Playwright, and other automation tools rely on the `Runtime.enable` CDP method to work with execution contexts. Any website can detect it with just a few lines of code.

With `Runtime.enable` on, Chrome serializes every `console` argument to send it over CDP. The classic check (a getter on `error.stack` that fires during `console.debug(error)`) stopped working in Chrome 137, but the serialization still runs `Error.prepareStackTrace` and reads the error's `name` an extra time, so the test checks those too. Open DevTools trigger it as well, which is a red flag on its own, and so can a logging library or extension that inspects console calls.

You can read more about it in this post: [How to fix Runtime.Enable CDP detection of Puppeteer, Playwright and other automation libraries?](https://rebrowser.net/blog/how-to-fix-runtime-enable-cdp-detection-of-puppeteer-playwright-and-other-automation-libraries-61740)

Fix: use `rebrowser-patches` to disable `Runtime.enable`.

### sourceUrlLeak
Puppeteer will automatically add a unique source URL to every script you run through it. It could be detected by analyzing the error stack.

Fix: use [`rebrowser-patches`](https://github.com/rebrowser/rebrowser-patches) to use some custom source URL.

### mainWorldExecution
Your target website could alter some really popular functions such as `document.querySelector` and track every time you use this function for your scripts. It's quite dangerous and will quickly raise a red flag against your browser.

Fix: use [`rebrowser-patches`](https://github.com/rebrowser/rebrowser-patches) to run all of your scripts in isolated contexts instead of the main context.

### navigatorWebdriver
Good old `navigator.webdriver`. It's Chrome's way to indicate that this browser is running by automation software.

Fix: just use the `--disable-blink-features=AutomationControlled` switch when you launch your Chrome.

### bypassCsp
Sometimes developers use `page.setBypassCSP(true)` to be able to run their scripts in some specific edge cases to avoid Content Security Policy (CSP) limitations. This behavior is unacceptable in any real browser as it's a high security risk.

Fix: you need to change your code in a way so you don't need to call this method; basically, avoid breaking CSP.

### viewport
When you run Puppeteer, by default, it uses an 800x600 viewport. Playwright uses 1280x720 as default value.

These exact sizes are a hint rather than proof, since an ordinary browser window can end up at them too, so the test marks them yellow. Anti-bot systems still weigh them together with other signals.

Fix: use `defaultViewport: null` (Puppeteer) and `viewport: null` (Playwright).

### window.dummyFn
The goal is to test that you can access main world objects. If you apply [`rebrowser-patches`](https://github.com/rebrowser/rebrowser-patches), then you cannot easily access the main world as all of your `page.evaluate()` scripts will be executed in an isolated world. To be able to do that, you need to use some special technique (read [How to Access Main Context Objects from Isolated Context in Puppeteer & Playwright](https://rebrowser.net/blog/how-to-access-main-context-objects-from-isolated-context-in-puppeteer-and-playwright-23741) or see rebrowser-patches repo for details). This test will help you to debug it.

### useragent
Puppeteer and Playwright use Google Chrome for Testing out of the box. It's a red flag for any anti-bot system.

### pwInitScripts
Playwright injects `__pwInitScripts` into the global scope of the every page by default.

### exposeFunctionLeak
It's quite popular to use `page.exposeFunction()` in Puppeteer and Playwright to pass some function from nodejs to browser env. However, this method is full of leaks in both of these libraries.

### headless
Headless Chrome gives itself away in several ways: `HeadlessChrome` in the user agent or `navigator.userAgentData.brands`, and, for `chrome-headless-shell` (Playwright's default headless mode, Puppeteer `headless: 'shell'`), a missing `window.chrome` and a `Notification.permission` that disagrees with `navigator.permissions.query()`. Softer signals are a desktop with no pointing device, an 800x600 screen and WebGL rendered by SwiftShader (Chrome 138+ has no automatic SwiftShader fallback).

Fix: run Chrome headful (e.g. under Xvfb). If you must run headless, use the new headless mode (`--headless=new`), not `chrome-headless-shell`.

### platformMismatch
When you override the user agent to look like another OS, `navigator.platform` and the client hints in `navigator.userAgentData` usually keep telling the truth. Puppeteer `page.setUserAgent(string)` also leaves `navigator.userAgentData.brands` empty, which never happens in a real desktop Chrome (apps that set a custom WebView user agent can cause it on mobile, so it's rated softer there).

The test also checks the CSS system colour `ActiveText` (idea by [heydryft](https://github.com/heydryft)). Since Chrome 138, in the light colour scheme, it resolves to pure red from Chrome's built-in palette on Linux and macOS, while Chrome on Windows uses the system hotlight colour, `rgb(0, 102, 204)` by default. So a browser that claims Windows but renders light `ActiveText` red (with forced colours off) is likely running on another OS, even if the user agent, `navigator.platform` and client hints were all spoofed consistently (e.g. by `puppeteer-extra-plugin-stealth`). Only a custom Windows colour scheme with a pure red hotlight colour would look the same.

Fix: don't pretend to be another OS. If you override the user agent, pass matching `userAgentMetadata` and `platform` too, and run on the OS you claim.

### workerConsistency
Values faked with page scripts (`evaluateOnNewDocument`, `addInitScript`, stealth plugins) and some CDP overrides (e.g. Playwright `locale`) don't reach Web Workers. The test compares `navigator` in a worker with the page. A different user agent, platform or brand list is a strong sign; different languages or CPU core count is a weaker one, because privacy extensions can cause it too.

Fix: avoid faking `navigator` properties; if you need a different locale, launch the browser with it.

### nativeTampering
Stealth plugins replace native functions or wrap them in a `Proxy` and patch `Function.prototype.toString` to hide it. A page can still tell: a `Proxy` doesn't catch a cyclic `__proto__`, injected wrappers show up in error stacks, and the `iframe.contentWindow` evasion of `puppeteer-extra-plugin-stealth` returns the parent window. Fingerprint-spoofing extensions cause the softer signals too.

Fix: don't patch native functions. Fix leaks at the source (launch flags, a real browser, rebrowser-patches) instead of covering them with JavaScript.

### mobileEmulation
Mobile emulation in Puppeteer (`page.emulate()`) and Playwright (`devices`) only changes what CDP can change. `navigator.maxTouchPoints` is 1, `navigator.platform` still reports the desktop CPU, and an iPhone user agent comes with a Chromium engine.

Fix: use a real device for mobile traffic.

## What is Rebrowser?
This package is sponsored and maintained by [Rebrowser](https://rebrowser.net). We allow you to scale your browser automation and web scraping in the cloud with hundreds of unique fingerprints.

Our cloud browsers have great success rates and come with nice features such as notifications if your library uses `Runtime.Enable` during execution or has other red flags that could be improved. [Create an account](https://rebrowser.net) today to get invited to test our bleeding-edge platform and take your automation business to the next level.

### Special thanks

[kaliiiiiiiiii/brotector](https://github.com/kaliiiiiiiiii/brotector)

[heydryft](https://github.com/heydryft) for the CSS system colour (`ActiveText`) idea
