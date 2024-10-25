const usePatchesTip = 'Use <a href="https://github.com/rebrowser/rebrowser-patches" target="_blank">rebrowser-patches</a> to fix it.'
const noFixTip = 'No fix available. Follow <a href="https://github.com/rebrowser/rebrowser-patches" target="_blank">rebrowser-patches</a> to stay up-to-date.'

function dummyFnInit() {
  addDetection({
    type: 'dummyFn',
    rating: 0,
    note: 'Call <code>window.dummyFn()</code> to test if you can access main world objects.',
  })

  window.dummyFn = () => {
    addDetection({
      type: 'dummyFn',
      rating: -1,
      note: '<code>window.dummyFn()</code> was called! It means you can interact with main world objects.',
    })
    return true
  }
}

function runtimeEnableLeakInit() {
  const testRuntimeEnableLeak = async () => {
    if (window.runtimeEnableLeakVars.stackLookupCount > 0) {
      addDetection({
        type: 'runtimeEnableLeak',
        rating: 1,
        note: `
            <div>You might have opened devtools. It's a red flag for any anti-bot system.</div>
            <div>You might have CDP with <code>Runtime.enable</code>. ${usePatchesTip}</div>
       `,
        debug: {
          stackLookupCount: window.runtimeEnableLeakVars.stackLookupCount,
        },
      })
      return
    }

    const e = new Error()
    Object.defineProperty(e, 'stack', {
      configurable: false,
      enumerable: false,
      get() {
        window.runtimeEnableLeakVars.stackLookupCount += 1
        return ''
      },
    })
    console.debug(e)

    setTimeout(testRuntimeEnableLeak, 100)
  }

  window.runtimeEnableLeakVars = {
    stackLookupCount: 0,
  }
  addDetection({
    type: 'runtimeEnableLeak',
    rating: -1,
    note: 'No leak detected.',
  })

  testRuntimeEnableLeak()
}

function testExposeFunctionLeakInit() {
  const testExposeFunctionLeak = async () => {
    const detection = {
      type: 'exposeFunctionLeak',
      note: 'No leak detected.',
      rating: -1,
    }

    if (typeof window.exposedFn === 'undefined') {
      detection.rating = 0
      detection.note = 'No <code>window.exposedFn</code>. Use <code>page.exposeFunction</code> to trigger this test.'
    } else if (window.exposedFn.toString()?.includes('This is the Puppeteer binding')) {
      detection.rating = 1
      detection.note = `
        <div>You're using unpatched Puppeteer and method <code>page.exposeFunction</code>.</div>
        <div>${noFixTip}</div>
        <div>Remove <code>page.exposeFunction</code> from your code to avoid this leak.</div>
      `
      detection.debug = {
        'exposedFn.toString()': window.exposedFn.toString(),
      }
    } else if (window.exposedFn.toString()?.includes('exposeBindingHandle supports a single argument')) {
      detection.rating = 1
      detection.note = `
        <div>You're using unpatched Playwright and method <code>page.exposeFunction</code>.</div>
        <div>${noFixTip}</div>
        <div>Remove <code>page.exposeFunction</code> from your code to avoid this leak.</div>
      `
      detection.debug = {
        'exposedFn.toString()': window.exposedFn.toString(),
      }
    } else {
      for (const key in window) {
        if (key.startsWith('puppeteer_')) {
          detection.rating = 1
          detection.note = `
            <div>You're using unpatched Puppeteer and method <code>page.exposeFunction</code>.</div>
            <div>${noFixTip}</div>
            <div>Remove <code>page.exposeFunction</code> from your code to avoid this leak.</div>
          `
          detection.debug = {
            windowKey: key,
          }
          break
        }
        if (key === '__playwright__binding__') {
          detection.rating = 1
          detection.note = `
            <div>You're using unpatched Playwright and method <code>page.exposeFunction</code> as it creates <code>window.__playwright__binding__</code> object.</div>
            <div>${noFixTip}</div>
            <div>Remove <code>page.exposeFunction</code> from your code to avoid this leak.</div>
          `
          detection.debug = {
            windowKey: key,
          }
          break
        }
        if (typeof window[key] === 'function' && window[key].__installed === true) {
          detection.rating = 1
          detection.note = `
            <div>You're using unpatched Playwright and method <code>page.exposeFunction</code>. It's detected because the exposed function has a property <code>__installed = true</code>.</div>
            <div>${noFixTip}</div>
            <div>Remove <code>page.exposeFunction</code> from your code to avoid this leak.</div>
          `
          detection.debug = {
            windowKey: key,
          }
          break
        }
      }
    }

    addDetection(detection)
    setTimeout(testExposeFunctionLeak, 100)
  }
  testExposeFunctionLeak()
}

function testPwInitScriptsInit() {
  const testPwInitScripts = async () => {
    if (window.__pwInitScripts !== undefined) {
      addDetection({
        type: 'pwInitScripts',
        rating: 1,
        note: `
            <div>You're using unpatched Playwright as it creates <code>window.__pwInitScripts</code> object.</div>
            <div>${noFixTip}</div>
       `,
        debug: {
          __pwInitScripts: window.__pwInitScripts,
        },
      })
      return
    }

    setTimeout(testPwInitScripts, 100)
  }

  addDetection({
    type: 'pwInitScripts',
    rating: -1,
    note: 'No <code>window.__pwInitScripts</code> detected.',
  })

  testPwInitScripts()
}

function testNavigatorWebdriver() {
  let note
  let debug
  if (navigator.webdriver === true) {
    note = '<code>navigator.webdriver = true</code> indicates that browser is automated. Use <code>--disable-blink-features=AutomationControlled</code> switch for Chrome.'
    debug = `typeof navigator.webdriver = ${typeof navigator.webdriver}; navigator.webdriver = ${navigator.webdriver}`
  } else if (typeof navigator.webdriver === 'undefined') {
    note = 'This property shouldn\'t be undefined. You might have it deleted manually.'
    debug = `typeof navigator.webdriver = ${typeof navigator.webdriver}`
  } else if (Object.getOwnPropertyNames(navigator).length !== 0) {
    note = '<code>Object.getOwnPropertyNames(navigator)</code> should return empty array.'
    debug = `Object.getOwnPropertyNames(navigator) = ${JSON.stringify(Object.getOwnPropertyNames(navigator))}`
  } else if (Object.getOwnPropertyDescriptor(navigator, 'webdriver') !== undefined) {
    note = '<code>Object.getOwnPropertyDescriptor(navigator, \'webdriver\')</code> should return undefined.'
    debug = `Object.getOwnPropertyDescriptor(navigator, 'webdriver') = ${Object.getOwnPropertyDescriptor(navigator, 'webdriver')}`
  }

  if (note) {
    addDetection({
      type: 'navigatorWebdriver',
      rating: 1,
      debug,
      note,
    })
  } else {
    addDetection({
      type: 'navigatorWebdriver',
      rating: -1,
      note: 'No webdriver presented.',
    })
  }
}

function testViewport() {
  let note
  const width = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0)
  const height = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0)
  if (width === 800 && height === 600) {
    note = 'Viewport has default Puppeteer values. Use <code>defaultViewport: null</code> in options.'
  } else if (width === 1280 && height === 720) {
    note = 'Viewport has default Playwright values. Use <code>viewport: null</code> in options.'
  }

  const debug = {
    width,
    height,
  }
  if (note) {
    addDetection({
      type: 'viewport',
      rating: 1,
      debug,
      note,
    })
  } else {
    addDetection({
      type: 'viewport',
      rating: -1,
      debug,
      note: 'Viewport is different from default values used in automation libraries.',
    })
  }
}

async function testUseragent() {
  if (typeof navigator.userAgentData === undefined) {
    addDetection({
      type: 'useragent',
      rating: 0,
      note: 'Cannot detect Chrome version as navigator.userAgentData is undefined.',
    })
    return
  }

  let rating
  let note
  const debug = {}
  const useragentVersionItems = await navigator.userAgentData.getHighEntropyValues(['fullVersionList']).then(ua => ua.fullVersionList.filter(item => ['Chromium', 'Google Chrome'].includes(item.brand)))
  debug.useragentVersionItems = useragentVersionItems
  const useragentVersionItemsBrands = useragentVersionItems.map(item => item.brand)

  if (!useragentVersionItems.length) {
    note = 'Cannot detect Chrome version. These tests are designed for Chromium based browsers only.'
    rating = .5
  } else if (useragentVersionItemsBrands.includes('Chromium') && !useragentVersionItemsBrands.includes('Google Chrome')) {
    note = `
    <div>Google Chrome is not presented in <code>navigator.userAgentData</code>. You might be using Google Chrome for Testing which is a red flag.</div>
    <div>Try to specify <code>executablePath</code> and use Google Chrome (stable channel).</div>
    `
    rating = 1
  } else {
    // get latest stable release
    let latestStableRelease
    try {
      const response = await fetch('https://chromiumdash.appspot.com/fetch_releases?channel=Stable&platform=Windows&num=1&offset=0')
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`)
      }
      latestStableRelease = (await response.json())[0]
    } catch (error) {
      console.error('[testUseragent] fetch failed:', error)
      addDetection({
        type: 'useragent',
        rating: 0,
        debug: {
          error: error.message,
        },
        note: 'Cannot fetch the latest stable release of Chrome.',
      })
      return
    }
    const latestStableReleaseVersion = latestStableRelease.version
    debug.latestStableRelease = {
      version: latestStableReleaseVersion,
      date: new Date(latestStableRelease.time),
    }

    // src: https://stackoverflow.com/a/16187766
    const cmpVersions = (a, b) => {
      var i, diff
      var regExStrip0 = /(\.0+)+$/
      var segmentsA = a.replace(regExStrip0, '').split('.')
      var segmentsB = b.replace(regExStrip0, '').split('.')
      var l = Math.min(segmentsA.length, segmentsB.length)

      for (i = 0; i < l; i++) {
        diff = parseInt(segmentsA[i], 10) - parseInt(segmentsB[i], 10)
        if (diff) {
          return diff
        }
      }
      return segmentsA.length - segmentsB.length
    }
    const googleChromeVersion = useragentVersionItems.find(item => item.brand === 'Google Chrome').version
    if (cmpVersions(googleChromeVersion, latestStableReleaseVersion) > 0) {
      note = 'Your Chrome version is higher than the latest stable release. You might be using not Stable channel which is abnormal.'
      rating = .5
    }
  }

  if (note) {
    addDetection({
      type: 'useragent',
      rating,
      debug,
      note,
    })
  } else {
    addDetection({
      type: 'useragent',
      rating: -1,
      debug,
      note: 'Google Chrome version is not higher than the latest stable release version which is fine.',
    })
  }
}

function testCsp() {
  const script = document.createElement('script')
  script.type = 'text/javascript'
  script.src = 'https://www.w3schools.com/js/myScript.js'
  script.onerror = () => {
    addDetection({
      type: 'bypassCsp',
      rating: -1,
      note: 'Content Security Policy (CSP) is enabled, it\'s expected behavior.',
    })
  }
  script.onload = () => {
    addDetection({
      type: 'bypassCsp',
      rating: 1,
      note: 'Content Security Policy (CSP) was ignored, you might use <code>Page.setBypassCSP</code> (Puppeteer) or <code>bypassCSP: true</code> (Playwright). It\'s invalid behavior for a normal browser.',
    })
  }
  document.head.appendChild(script)
}

function testMainWorldExecution() {
  addDetection({
    type: 'mainWorldExecution',
    rating: 0,
    note: 'Call <code>document.getElementsByClassName(\'div\')</code> to trigger this test. If you did and the test wasn\'t triggered, then you\'re running it in an isolated world, which is safe and not detectable.',
  })

  document.getElementsByClassName = (function (original) {
    return function () {
      addDetection({
        type: 'mainWorldExecution',
        rating: 1,
        note: 'You\'ve called <code>document.getElementsByClassName()</code> in the main world. Use <a href="https://github.com/rebrowser/rebrowser-patches" target="_blank">rebrowser-patches</a> to run your scripts in an isolated world.',
        debug: {
          args: Object.values(arguments),
        },
      })
      return original.apply(this, arguments)
    }
  }(document.getElementsByClassName))
}

function testSourceUrl() {
  function testSourceUrlError() {
    const error = new Error('Detection Error')
    let note
    const debug = error.stack.toString()
    if (error.stack.toString().includes('pptr:')) {
      note = 'Error stack contains <code>pptr:</code>. You\'re using unpatched Puppeteer.'
    } else if (error.stack.toString().includes('UtilityScript.')) {
      note = 'Error stack contains <code>UtilityScript.</code>. You\'re using unpatched Playwright.'
    }

    if (note) {
      addDetection({
        type: 'sourceUrlLeak',
        rating: 1,
        note: `${note} ${usePatchesTip}`,
        debug,
      })
    } else {
      addDetection({
        type: 'sourceUrlLeak',
        rating: -1,
        note: 'Error stack doesn\'t contain anything suspicious.',
        debug,
      })
    }
  }

  document.getElementById = (function (original) {
    return function () {
      testSourceUrlError()
      return original.apply(this, arguments)
    }
  })(document.getElementById)

  addDetection({
    type: 'sourceUrlLeak',
    rating: 0,
    note: 'Call <code>document.getElementById(\'detections-json\')</code> to test sourceUrl leak.',
  })
}

function addDetection(data) {
  if (data.rating === undefined) {
    data.rating = 1
  }

  const existingDetection = detections.find(d => d.type === data.type)
  if (existingDetection !== undefined) {
    if (data.once) {
      return
    }

    if (data.rating === existingDetection.rating && data.note === existingDetection.note) {
      // no changes, ignore
      return
    }
  }

  console.log('addDetection', data)

  data.msSinceLoad = parseFloat((window.performance.now() - window.startTime).toFixed(3))
  if (data.replace === false) {
    window.detections.push(data)
  } else {
    const existingIndex = window.detections.findIndex(d => d.type === data.type)
    if (existingIndex === -1) {
      window.detections.push(data)
    } else {
      window.detections[existingIndex] = data
    }
  }

  renderDetections()
}

function renderDetections() {
  const tbody = document.createElement('tbody')

  const addRow = (cols) => {
    const row = tbody.insertRow(-1)
    for (const colNum in cols) {
      const cell = row.insertCell(colNum)
      cell.innerHTML = cols[colNum]
      row.appendChild(cell)
    }
  }

  for (const detection of window.detections) {
    let ratingIcon = '🔴'
    if (detection.rating === 0.5) {
      ratingIcon = '🟡'
    } else if (detection.rating === 0) {
      ratingIcon = '⚪️'
    } else if (detection.rating < 0) {
      ratingIcon = '🟢'
    }

    addRow([
      `<span class="text-nowrap">${ratingIcon} ${detection.type}</span>`,
      `<span class="text-nowrap">${detection.msSinceLoad} ms</span>`,
      `
        ${detection.note}
        ${!detection.debug ? '' : `
          <pre>${typeof detection.debug === 'string' ? detection.debug : JSON.stringify(detection.debug, null, 2)}</pre>
        `}
      `,
    ])
  }

  document.querySelector('#detections-table tbody').replaceWith(tbody)
  document.querySelector('#detections-json').value = JSON.stringify(detections, null, 2)
}

function initTests() {
  window.detections = []
  window.startTime = window.performance.now()
  dummyFnInit()
  testSourceUrl()
  testMainWorldExecution()
  runtimeEnableLeakInit()
  testExposeFunctionLeakInit()
  testNavigatorWebdriver()
  testCsp()
  testViewport()
  testUseragent()
  testPwInitScriptsInit()
}

function toggleHowTo() {
  document.querySelector('#how-to-run-test').classList.toggle('d-none')
}

async function main() {
  initTests()
}

window.onload = main
