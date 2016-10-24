"use strict"
// **** mini scene and canvas based graphics lib ****
//depends on lib.js
//author: Onne Gorter
//license: CC0

/// This mini canvas graphics library maintains a scene graph based on `Layer`s (and `Box`es).
/// It makes it easy to load resources and build and maintain a scene graph. And to receive
/// and process events per object. The `Layer`s have `delegate`s that do the actual rendering
/// and event handing. Both graphics and images use native objects (`CanvasRenderingContext2D`
/// context and `Image`).

var _default_context = null

// wraps native DOM events
class GEvent {
    constructor(x, y, globalx, globaly, event, target, last, delta) {
        this.x = x                 /// x coordinate relative to this.target
        this.y = y                 /// y coordinate relative to this.target
        this.globalx = globalx     /// x coordinate absolute to root of scene
        this.globaly = globaly     /// y coordinate absolute to root of scene
        this.target = target       /// the target of this event
        this.domevent = event      /// the native DOM event
        this.last = last || false  /// set to true if this is the last event of a follow
        this.delta = delta || null /// set to {x,y} as difference from start of follow
    }

    /// convert to a global point
    toGlobal() {
        return {x:this.globalx, y:this.globaly}
    }

    /// follow a `ondown` event, and call `cb` for every `onmove` event
    /// last call will be from an `onup` event and `event.last` will be `true`
    follow(cb) {
        if (this.domevent instanceof Touch) return startFollowTouch(this.domevent, cb, this)
        pushFollowHandlers(cb, this)
    }
}

function runEvent(target, x, y, globalx, globaly, event, name) {
    var handler = null
    if (target.delegate) handler = target.delegate[name]
    if (!handler) return false

    var passToParent = handler.call(target.delegate, new GEvent(x, y, globalx, globaly, event, target))
    return !passToParent
}

function startFollowTouch(touch, handler, event) {
    _followtouch[touch.identifier] = {handler, target: event.target, start:{x:event.globalx, y:event.globaly}}
}

function followTouch(follow, touch, globalx, globaly, name) {
    var handler = follow.handler
    var target = follow.target
    var start = follow.start
    if (!handler) return
    assert(target)
    var l = target.toGlobal()
    var x = globalx - l.x
    var y = globaly - l.y
    var delta = {x:globalx - start.x, y:globaly - start.y}
    var last = name === "onup"
    handler.call(target.delegate, new GEvent(x, y, globalx, globaly, touch, target, last, delta))
    _default_context.schedule()
}

function pushFollowHandlers(handler, event) {
    _default_context.follow = handler
    _default_context.followtarget = event.target
    _default_context.followstart = {x:event.globalx, y:event.globaly}
    _default_context.c.onmousemove = followmousemove
    _default_context.c.onmouseup = followmouseup
}

function restoreMouseHandlers() {
    _default_context.follow = null
    _default_context.followtarget = null
    _default_context.c.onmousemove = _default_context.onmousemove
    _default_context.c.onmouseup = _default_context.onmouseup
}

function _follow2(event, last) {
    var handler = _default_context.follow
    var target = _default_context.followtarget
    var start = _default_context.followstart
    if (!handler) return
    assert(target)
    var globalx = event.offsetX
    var globaly = event.offsetY
    var l = target.toGlobal()
    var x = globalx - l.x
    var y = globaly - l.y
    var delta = {x:globalx - start.x, y:globaly - start.y}
    handler.call(target.delegate, new GEvent(x, y, globalx, globaly, event, target, last, delta))
    event.preventDefault()
    _default_context.schedule()
}

function followmousemove(event) {
    _follow2(event, false)
}

function followmouseup(event) {
    _follow2(event, true)
    restoreMouseHandlers()
}

/// context
class GContext {
    constructor(width, height) {
        this.root = null     /// the root of the scene, `add()` other `Layer`s, set its `style`, or give it a `delegate`
        this.onready = null  /// handler that is called after all assets have loaded
        this.onrender = null /// handler that is called before rerendering scene

        // private
        this.g = null
        this.c = null
        this.width = width
        this.height = height
        this.handlers = {} // event handlers

        // initializing and loading images
        this.loading = 1
        this.images = {}

        if (!_default_context) _default_context = this
        this.schedule()
    }

    mount(c, g) {
        this.c = c
        this.g = g
        c.width = g.width = this.width
        c.height = g.height = this.height

        // ensure canvas has all handlers installed
        Object.each(this.handlers, (handler, eventname)=> { c[eventname] = handler })
    }

    draw(layer) {
        if (layer.style.hidden) return
        var g = this.g
        g.save()
        g.translate(layer.x, layer.y)
        if (!fequals(layer.rotate, 0.001)) g.rotate(layer.rotate)
        layer.draw(g, this)
        g.restore()
    }

    render() {
        this.scheduled = false
        if (this.loading > 0) return
        if (this.onrender) this.onrender()

        var root = this.root
        root.x = root.y = 0
        root.width = this.c.width = this.g.width = this.width
        root.height = this.c.height = this.g.height = this.height
        root.layout()
        this.g.font = "24px Arial"
        this.g.save()
        this.draw(root)
        this.g.restore()
    }

    /// call if some external event should rerender scene, harmless to call multiple times
    /// internal events like `ondown`, or images that load, will call this automatically
    schedule() {
        if (this.scheduled) return
        this.scheduled = true
        requestAnimationFrame(_renderContext)
    }

    /// load an image from `url`, returns the img immediately
    /// use `onready` to wait for all assets to have loaded
    image(url) {
        var img = this.images[url]
        if (img) return img

        this.loading += 1
        img = this.images[url] = new Image()
        img.onload = ()=> {
            console.log("loaded:", img.src)
            this.loaded()
        }
        img.onerror = (event)=> {
            console.warn("error loading:", img.src)
            this.loaded()
        }
        img.src = url
        return img
    }

    /// to be called if a resource is done loading, images or the dom
    loaded() {
        this.loading -= 1
        assert(this.loading >= 0)
        if (this.loading !== 0) return

        this.schedule()
        if (this.onready) this.onready()
    }

    whenReady(cb) {
        this.onready = cb
    }
}

function _renderContext() {
    _default_context.render()
}

function imageCheck(img) {
    if (!img.complete) return false
    if (img.naturalWidth !== "undefined" && img.naturalWidth === 0) return false
    return true
}

function roundedRect(g, x, y, width, height, r) {
    g.beginPath()
    g.moveTo(x + r, y)
    g.lineTo(x + width - r, y)
    g.quadraticCurveTo(x + width, y, x + width, y + r)
    g.lineTo(x + width, y + height - r)
    g.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
    g.lineTo(x + r, y + height)
    g.quadraticCurveTo(x, y + height, x, y + height - r)
    g.lineTo(x, y + r)
    g.quadraticCurveTo(x, y, x + r, y)
    g.closePath()
}

/// create a new scene, give it a canvas, and insert it in the dom
function createScene(width, height, parent) {
    var context = new GContext(width || 400, height || 300)
    var root = new RootBox(context)
    context.root = root
    if (!_default_context) _default_context = context

    function loadScene() {
        if (typeof(parent) === "string") parent = document.getElementById(parent)
        parent = parent || document.body

        var c = document.createElement("canvas")
        c.setAttribute("style", "-webkit-user-select:none;-khtml-user-select:none;-moz-user-select:-moz-none;-o-user-select:none;user-select:none;")
        parent.appendChild(c)
        var g = c.getContext("2d")
        context.mount(c, g)
        context.loaded()
    }

    if (document.readyState === "complete") {
        requestAnimationFrame(loadScene)
    } else {
        window.addEventListener("load", loadScene)
    }

    return root
}

function ensureMouseEvents(context, eventname, name) {
    var handlers = context.handlers
    if (handlers[eventname]) return
    var handler = handlers[eventname] = (event)=> {
        context.schedule()
        var globalx = event.offsetX
        var globaly = event.offsetY
        var done = context.root.fireEvent(globalx, globaly, globalx, globaly, event, name)
        if (done) event.preventDefault()
    }
    // if loaded
    if (context.c) context.c[eventname] = handler
}

var _followtouch = {}
var _multitouch = ('ontouchstart' in window) || window.DocumentTouch && document instanceof DocumentTouch
function ensureTouchEvents(context, eventname, name) {
    if (!_multitouch) return
    var handlers = context.handlers
    if (handlers[eventname]) return
    var handler = handlers[eventname] = (event)=> {
        context.schedule()
        for (var i = 0; i < event.changedTouches.length; i++) {
            var touch = event.changedTouches[i]
            var globalx = touch.pageX - touch.target.offsetLeft
            var globaly = touch.pageY - touch.target.offsetTop
            var follow = _followtouch[touch.identifier]
            if (follow) {
                event.preventDefault()
                followTouch(follow, touch, globalx, globaly, name)
                if (eventname === "ontouchend" || eventname === "ontouchcancel") delete _followtouch[touch.identifier]
                assert(Object.keys(_followtouch).length < 10)
                continue
            }
            var done = context.root.fireEvent(globalx, globaly, globalx, globaly, touch, name)
            if (done) event.preventDefault()
        }
    }
    // if loaded
    if (context.c) context.c[eventname] = handler
}

// if a delegate has event handlers, make the layer interactive and ensure the handlers are set
function ensureInteractive(layer, delegate) {
    layer.interactive = false
    if (!delegate) return

    // TODO perhaps get scene from layer? not possible at the moment
    var context = _default_context
    if (!context) return

    if (delegate["ondown"]) {
        layer.interactive = true
        ensureMouseEvents(context, "onmousedown", "ondown")
        ensureTouchEvents(context, "ontouchstart", "ondown")
        ensureTouchEvents(context, "ontouchend", "onup") // the rest is here for follow ...
        ensureTouchEvents(context, "ontouchcancel", "onup")
        ensureTouchEvents(context, "ontouchmove", "onmove")
    }
    if (delegate["onup"]) {
        layer.interactive = true
        ensureMouseEvents(context, "onmouseup", "onup")
        ensureTouchEvents(context, "ontouchend", "onup")
        ensureTouchEvents(context, "ontouchcancel", "onup")
    }
    if (delegate["onmove"]) {
        layer.interactive = true
        ensureMouseEvents(context, "onmousemove", "onmove")
        ensureTouchEvents(context, "ontouchmove", "onmove")
        ensureTouchEvents(context, "ontouchend", "onup")
        ensureTouchEvents(context, "ontouchcancel", "onup")
    }
}

/// a layer that can be rendered
/// set its `style` properties to render `{background:"red"}`
/// give it a `delegate` that has methods to `draw(g)` or receive events (`ondown`, `onup`, `onmove`)
/// if the `delegate` is a function, it is assumed to be the draw function
class Layer {
    constructor(style, delegate) {
        style = style || {}
        delegate = delegate || style.delegate || null /// delegate

        this.x = style.x || 0 /// x coordinate
        this.y = style.y || 0 /// y coordinate
        this.z = style.z || 0 /// z index, the highest z-index is drawn last
        this.width = style.width || 0   /// width of layer
        this.height = style.height || 0 /// height of layer
        this.rotate = style.rotate || 0 /// rotation of layer, only used for rendering, events ignore rotation
        this.style = style /// style of this object, can be used to set `background` color and such
        this.delegate = null /// delegate, to `draw(g)` or handle events

        // private
        this.parent = null
        this.interactive = false

        this.setDelegate(delegate)
        if (style.parent) style.parent.add(this)
    }

    setDelegate(delegate) {
        this.delegate = delegate
        ensureInteractive(this, delegate)
    }

    /// remove this layer from the scene, can re-add afterwards
    remove() {
        if (!this.parent) return
        this.parent.removeChild(this)
        assert(!this.parent)
    }

    toGlobalXY(x, y) {
        if (!this.parent) return {x:this.x + x, y:this.y + y}
        return this.parent.toGlobalXY(this.x + x, this.y + y)
    }

    toGlobal() {
        if (!this.parent) return {x:this.x, y:this.y}
        return this.parent.toGlobalXY(this.x, this.y)
    }

    /// from a point or event, return an object with relative coords
    toLocal(point) {
        if (point instanceof GEvent) {
            var p = point.toGlobal()
            var l = this.toGlobal()
            p.x -= l.x
            p.y -= l.y
            return p
        }
        l = this.toGlobal()
        l.x = point.x - l.x
        l.y = point.y - l.y
        return l
    }

    /// from a point or event, return if the point is in this layer
    contains(point) {
        var l = this.toLocal(point)
        return l.x >= 0 && l.x <= this.width && l.y >= 0 && l.y <= this.height
    }

    /// return true if {x,y} in local coords are in this layer
    containsLocalXY(x, y) {
        return x >= 0 && x <= this.width && y >= 0 && y <= this.height
    }

    /// return true if {x,y} as global coords are in this layer
    containsXY(x, y) {
        return this.contains({x,y})
    }

    // private
    drawBackground(g) {
        if (this.style.background || this.style.border) {
            if (this.style.borderRadius) {
                roundedRect(g, 0, 0, this.width, this.height, this.style.borderRadius)
            } else {
                g.beginPath()
                g.rect(0, 0, this.width, this.height)
            }
            if (this.style.background) {
                g.fillStyle = this.style.background
                g.fill()
            }
            if (this.style.border) {
                g.strokeStyle = this.style.border
                g.lineWidth = this.style.borderWidth || 1
                g.stroke()
            }
        }
        if (this.style.backgroundImage && imageCheck(this.style.backgroundImage)) {
            g.drawImage(this.style.backgroundImage, 0, 0, this.width, this.height)
        }
    }

    drawDelegate(g, scene) {
        if (this.delegate) {
            if (typeof(this.delegate) === "function") {
                g.beginPath()
                return this.delegate(g, this, scene)
            }
            if (this.delegate.draw) {
                g.beginPath()
                return this.delegate.draw(g, this, scene)
            }
        }
    }

    draw(g, scene) {
        this.drawBackground(g)
        this.drawDelegate(g, scene)
    }

    fireEvent(x, y, globalx, globaly, event, name) {
        if (!this.interactive || !this.containsLocalXY(x, y)) return false
        return runEvent(this, x, y, globalx, globaly, event, name)
    }

    layout() {
        if (this.delegate && this.delegate.layout) this.delegate.layout(this)
    }

    minHeight() {
        return this.style.minHeight || this.height
    }

    minWidth() {
        return this.style.minWidth || this.width
    }
}

function zsortfn(left, right) { return left.z - right.z }
function zsort(ls) {
    var il = ls.length
    if (il === 0) return ls

    var z = ls[0]
    var sort = false
    for (var i = 1; i < il; i++) {
        if (ls[i].z !== z) { sort = true; break }
    }
    if (!sort) return ls
    return ls.slice().stablesort(zsortfn)
}

/// a container for layers, is a layer itself
class Box extends Layer {
    constructor(delegate, width, height) {
        super(delegate, width, height)
        this.children = []
    }

    /// add layers, may also pass in objects that have a `layer` property
    add() {
        for (var i = 0, il = arguments.length; i < il; i++) {
            var object = arguments[i]
            var layer = (object instanceof Layer)? object : object.layer
            assert(layer instanceof Layer)
            assert(!layer.parent)
            layer.parent = this
            this.children.push(layer)
            if (object !== layer && !layer.delegate) layer.setDelegate(object)
        }
    }

    /// remove a layer, may also pass in object that has a `layer` property
    removeChild(child) {
        var layer = (child instanceof Layer)? child : child.layer
        assert(layer.parent === this)
        assert(this.children.indexOf(layer) >= 0)
        layer.parent = null
        this.children.remove(layer)
        assert(this.children.indexOf(layer) < 0)
    }

    // private
    draw(g, scene) {
        super.draw(g, scene)
        var cs = zsort(this.children)
        for (var i = 0, il = cs.length; i < il; i++) {
            var layer = cs[i]
            assert(layer instanceof Layer)
            assert(layer.parent === this)
            scene.draw(layer)
        }
    }

    fireEvent(x, y, globalx, globaly, event, name) {
        // TODO should take zindex sorting into account
        for (var i = 0, il = this.children.length; i < il; i++) {
            var layer = this.children[il - 1 - i]
            assert(layer instanceof Layer)
            assert(layer.parent === this)
            var done = layer.fireEvent(x - layer.x, y - layer.y, globalx, globaly, event, name)
            if (done) return done
        }
        if (!this.interactive || !this.containsLocalXY(x, y)) return false
        return runEvent(this, x, y, globalx, globaly, event, name)
    }

    layout() {
        var cs = this.children
        for (var i = 0, il = cs.length; i < il; i++) {
            var layer = cs[i]
            layer.layout()
        }
    }
}

class RootBox extends Box {
    constructor(context) {
        super(null, context.width, context.height)
        this.context = context
    }

    image(src) {
        return this.context.image(src)
    }

    whenReady(cb) {
        return this.context.whenReady(cb)
    }
}

class Column extends Box {
    layout() {
        if (this.delegate && this.delegate.layout) this.delegate.layout(this)

        var padding = (this.style.padding || 0)
        var gutter = (this.style.gutter || 0)
        var grow = 0
        var height = padding * 2

        var cs = this.children
        for (var i = 0, il = cs.length; i < il; i++) {
            var layer = cs[i]
            layer.layout()
            if (layer.style.position === "absolute") continue
            height += layer.minHeight()
            grow += Math.max(0, (layer.style.grow || 0))
        }
        height += gutter * Math.max(0, cs.length - 1)

        var y = padding
        var leftover = this.height - height
        if (grow === 0) {
            switch (this.style.justifyContent) {
                case "start": break
                case "end": y += leftover; break
                default: y += leftover / 2
            }
        } else {
            grow = leftover / grow
        }

        var palign = (this.style.alignItems || "stretch")
        for (var i = 0, il = cs.length; i < il; i++) {
            var layer = cs[i]
            if (layer.style.position === "absolute") continue
            var align = layer.style.alignSelf || palign
            switch (align) {
                case "start": layer.x = 0; break
                case "center": layer.x = this.width/2 / layer.width/2; break
                case "end": layer.x = this.width - layer.width; break
                default: layer.x = 0; layer.width = this.width
            }
            layer.y = Math.floor(y)
            if (grow && layer.style.grow) {
                layer.height = Math.floor(layer.minHeight() + layer.style.grow * grow)
            }
            y += layer.height + gutter
        }
    }
}

class Row extends Box {
    layout() {
        if (this.delegate && this.delegate.layout) this.delegate.layout(this)

        var padding = (this.style.padding || 0)
        var gutter = (this.style.gutter || 0)
        var grow = 0
        var width = padding * 2

        var cs = this.children
        for (var i = 0, il = cs.length; i < il; i++) {
            var layer = cs[i]
            layer.layout()
            if (layer.style.position === "absolute") continue
            width += layer.minWidth()
            grow += Math.max(0, (layer.style.grow || 0))
        }
        width += gutter * Math.max(0, cs.length - 1)

        var x = padding
        var leftover = this.width - width
        if (grow === 0) {
            switch (this.style.justifyContent) {
                case "start": break
                case "end": x += leftover; break
                default: x += leftover / 2
            }
        } else {
            grow = leftover / grow
        }

        var palign = (this.style.alignItems || "stretch")
        for (var i = 0, il = cs.length; i < il; i++) {
            var layer = cs[i]
            if (layer.style.position === "absolute") continue
            var align = layer.style.alignSelf || palign
            switch (align) {
                case "start": layer.y = 0; break
                case "center": layer.y = this.height/2 / layer.height/2; break
                case "end": layer.y = this.height - layer.height; break
                default: layer.y = 0; layer.height = this.height
            }
            layer.x = Math.floor(x)
            if (grow && layer.style.grow) {
                layer.width = Math.floor(layer.minWidth() + layer.style.grow * grow)
            }
            x += layer.width + gutter
        }
    }
}

function col() {
    var box = new Column()
    for (var i = 0, il = arguments.length; i < il; i++) {
        var child = arguments[i]
        if (child) box.add(child)
    }
    return box
}

function row() {
    var box = new Row()
    for (var i = 0, il = arguments.length; i < il; i++) {
        var child = arguments[i]
        if (child) box.add(child)
    }
    return box
}

class TextLayer extends Layer {
    constructor(text, style, delegate) {
        super(style, delegate)
        this.text = text
        this._text = null
    }

    draw(g) {
        this.drawBackground(g)

        this.setFont(g)
        this.layout()
        var padding = this.style.padding || 0
        var x = padding
        var y = padding + (this.height - padding * 2) * 0.80
        switch (this.style.align) {
            case "left": x = padding; break
            case "right": x = padding; break
            default: x = this.width/2 - this.width/2 + padding
        }
        if (this.style.shadowColor) {
            g.fillStyle = this.style.shadowColor
            g.fillText(this._text, x - 1, y - 1)
        }
        g.fillStyle = this.style.color || "black"
        g.fillText(this._text, x, y)

        this.drawDelegate(g)
    }

    setFont(g) {
        if (g.font === this._font) return
        this._font = this.style.font || "24px Arial"
        g.font = this._font
    }

    layout() {
        if (this._text === this.text) return
        this._text = this.text
        var padding = this.style.padding || 0

        var g = _default_context.g
        this.setFont(g)
        this.width = g.measureText(this.text).width + padding * 2
        this.height = 2 + g.measureText("W").width + padding * 2 // no way to get font metrics, so approx
    }

    minWidth() {
        return this.width
    }

    minHeight() {
        return this.height
    }
}

