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
            <div>You might have CDP with <code>Runtime.enable</code>. Use <a href="https://github.com/rebrowser/rebrowser-patches" target="_blank">rebrowser-patches</a>.</div>
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
      note: 'No webdriver, no signs of automation.',
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
        note: `${note} Use <a href="https://github.com/rebrowser/rebrowser-patches" target="_blank">rebrowser-patches</a>.`,
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
  console.log('addDetection', data)

  if (data.rating === undefined) {
    data.rating = 1
  }

  if (data.once && detections.find(d => d.type === data.type) !== undefined) {
    return
  }

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
  testNavigatorWebdriver()
  testCsp()
  testViewport()
}

async function main() {
  initTests()
}

window.onload = main
