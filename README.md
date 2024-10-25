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

It's quite noticeable and easy to detect. None of the normal users with normal browsers will have such viewports.

Fix: use `defaultViewport: null` (Puppeteer) and `viewport: null` (Playwright).

### window.dummyFn
The goal is to test that you can access main world objects. If you apply [`rebrowser-patches`](https://github.com/rebrowser/rebrowser-patches), then you cannot easily access the main world as all of your `page.evaluate()` scripts will be executed in an isolated world. To be able to do that, you need to use some special technique (read [How to Access Main Context Objects from Isolated Context in Puppeteer & Playwright](https://rebrowser.net/blog/how-to-access-main-context-objects-from-isolated-context-in-puppeteer-and-playwright-23741) or see rebrowser-patches repo for details). This test will help you to debug it.

### useragent
Puppeteer and Playwright use Google Chrome for Testing out of the box. It's a red flag for any anti-bot system.

### pwInitScripts
Playwright injects `__pwInitScripts` into the global scope of the every page by default.

### exposeFunctionLeak
It's quite popular to use `page.exposeFunction()` in Puppeteer and Playwright to pass some function from nodejs to browser env. However, this method is full of leaks in both of these libraries.

## What is Rebrowser?
This package is sponsored and maintained by [Rebrowser](https://rebrowser.net). We allow you to scale your browser automation and web scraping in the cloud with hundreds of unique fingerprints.

Our cloud browsers have great success rates and come with nice features such as notifications if your library uses `Runtime.Enable` during execution or has other red flags that could be improved. [Create an account](https://rebrowser.net) today to get invited to test our bleeding-edge platform and take your automation business to the next level.

### Special thanks

[kaliiiiiiiiii/brotector](https://github.com/kaliiiiiiiiii/brotector)
