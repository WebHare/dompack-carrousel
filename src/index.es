import * as dompack from "dompack";
import IScroll from "./iscroll.modified";

let tempid = 0;


if (!window.__spc_carrousels)
  window.__spc_carrousels = [];

export default class SpellcoderCarrousel
{
  /*
  Variables used internally:
      options
      node
      nodes.viewport
      nodes.content
      nodes.btn_prev
      nodes.btn_next
      items
      items[].node
      items[].width
      items[].height
      items[].left
      items[].right
      items[].usecount - at every animation frame the count is started at 0. It's used to deteremine which index to use in nodecopies.
      items[].nodecopies - the original carrousel__cell and it's clones. when more clones are needed to fill up the carrousel's viewport, a clone is added on-the-fly.

      items_onscreen - list of nodes in use. used to match after drawing all caroussel-cell's which nodes from the previous animation frame aren't used anymore and must be moved offscreen.

      scrollleft - the virtual scroll left we internally work with
      width_content - the size of the content (which will be repeated)
      width_viewport
      largestslideheight

      slide_virtualstartidx
      slide_offset

      activeslideidx
      activeslidenode
      alignedslideidx
      alignedslidenode

      paused // not implemented yet
  */
  constructor(node, options)
  {
    // DEBUG
    window.__spc_carrousels.push(this);

    tempid++;
    this.tempid = tempid;

    // for debugging
    this.logprefix = "name" in options ? "[SPC/CARROUSEL/"+options.name+"]"
                                       : "[SPC/CARROUSEL #" + this.tempid + "]";

    if (!node)
    {
      console.error("SpellcoderCarrousel got null as node.");
      return;
    }

    var domoptions = dompack.getJSONAttribute(node, "data-carrousel-options");

    this.options = Object.assign(
            { // layout  -----------------------------------------------------------------------
              gap:                20
            , slidewidth:         0 // if set, the fixed width (in px) will be used instead of the measures width
            , height:             0 // to override the automatic height based on slide height
                                    // (auto slide height doesn't take things like box-shadow's into account and so the overflow: hidden; meant to prevent page overflow will cut off the box-shadows)

            // padding around the content space in which the active slide is positioned
            , paddingLeft:        0
            , paddingRight:       0

            /*
            "viewport_left"   - active slide will be at the far left, regardless of paddingLeft
            "viewport_middle" - center the cell in the full space used by the carrousel
            "viewport_right"  - !! not implemented yet

            "left" - left
            "middle" - center the cell in the content space (between the paddingLeft and paddingRight)
            "right" - !! not implemented yet
            */
            , activeslidealignment:  "left"
            , vertical_align:        "top" // "top", "middle", "bottom"


            // scroll behaviour -----------------------------------------------------------------
            , interactable:        true // allow drag, keyboard interaction etc... (if you use multiple carrousels and one is the main)
            , useiscroll:          true // if false, no scroll animation is performed and no dragging is possible
            , draggable:           true
            , snap:                true
            , blockscrolloncontentleft: false
            , scroll_deceleration: 0.004 // default of iScroll is 0.0006


            // content --------------------------------------------------------------------------
            , items:                 "" // nodeList or string(selectors)
            , renderinfo:            null
            , masonry_renderinfo:    [] // renderinfo from Spellcoder Masonry, to turn a Masonry into an Carrousel
            , contentnode:           null // node in which to place newly clones nodes. for easy grouping (destroying/fade effects)



            // layout overrides ---------------------------------------------------------------
            // (use at own risk)

            , contentwidth:          null // amount of pixels after which the content will be repeated


            // behaviour ----------------------------------------------------------------------

            , nextSlideDelay:     5000  // ADDME
            , transitionDuration: 750

            /** allow mouse/touch events to pass, so vertical scrolling keeps working
               downside is that dragging may cause selections. */
            , eventPassthrough:   true

            , initialslide:        0       // set to "none" to start a left 0 of the original content
            , activateslidewithclick: true // when clicking on a cell, make it the active slide

            , keyboardnavigation:  true

            /** In case cases you might want to first setup stuff.. or prevent getting a callback before getting the returnvalue of new Carrousel..
                If this is the case set autodraw_firstframe to false and call drawFrame();
            */
            , autodraw_firstframe: true

            , debugoptions:       false // show computer carrousel and iScroll options
            , debugslides:        false // show debug info in slides
            , debugdimensions:    false // show debug information on the calculated slides and carrousel dimensions
            , debugdraw:          false // show debug information on drawing/animation

            , delayfirstframe:    false

            // hooks & internal ---------------------------------------------------------------
            , ondrawframe:        null // hook to call when a frame is drawn (this is done in an animationframe, usually when the scroll position has changed or an update has been forced)
            // optimalizations
            , items_positions_ordered: true // when using as a slideshow, simple horizontal carrousel all images can be placed after eachother and drawing can end upon the first item which is outside the viewport
                                            // Set this to false if using the carrousel for arbitrary positioned content (for example an masonry)
            }, domoptions, options);

    this.node = node;

    this.nodes = {};

    this.nodes =
            { dragarea:   this.getSelfOrChild(node, "carrousel__dragarea")
            , viewport:   this.getSelfOrChild(node, "carrousel__viewport") // positioning container for items + focus element for keyboard navigation
            , content:    this.options.contentnode ? this.options.contentnode : this.getSelfOrChild(node, "carrousel__content") // for easy grouping of all items (easy deletion/replacing), falls back to viewport if not existant.. all copies of content will be thrown into this container.
            , btn_prev:   this.getSelfOrChild(node, "carrousel__previous")
            , btn_next:   this.getSelfOrChild(node, "carrousel__next")
            };

    //this._addToLog("Initialized while document readyState is " + document.readyState);

    if (this.options.debugoptions)
    {
      console.groupCollapsed(this.logprefix);
      console.log("Computed options", this.options);
      console.groupEnd();
    }

    if (!this.nodes.dragarea)
      this.nodes.dragarea = this.node;

    if (!this.nodes.viewport)
      this.nodes.viewport = this.node;

    if (!this.nodes.content)
      this.nodes.content = this.nodes.viewport;

    this.nodes.viewport.tabIndex = -1;
    this.nodes.viewport.addEventListener("keydown", this.onKeyPress.bind(this));

    this.items = []; // the original slides/carousel-cells
    this.items_onscreen = [];

    this.scrollleft = 0;
    this.width_viewport = 0;
    this.width_content = 0;
    this.largestslideheight = 0;

    // variables to allow navigation to work during an active scroll
    // (otherwise we have to freeze the navigation buttons until each previous/next action has completed)
    this.slide_virtualstartidx = -1; // from which slide we started to slide. used to determine the direction of the scroll.
    this.slide_offset = 0; // how many items to slide during the current scroll action

    this.activeslideidx = this.options.initialslide;
    this.activeslidenode = null;

    this.alignedslide = null;
    this.alignedslideidx = this.options.initialslide;
    //this.alignedslidevirtualidx = 0;
    this.alignedslidenode = null;

    this.animationframe = null;

    //this.paused = false;

    if ("renderinfo" in options)
    {
      this.importRenderInfo(options.renderinfo);
    }
    else if ("masonry_renderinfo" in options)
    {
      this.importSlidesFromMasonry(options.masonry_renderinfo);
    }
    else if ("items" in options)
    {
      if (typeof(options.items) == "string") // assume a selector string
      {
        console.log("items is a selector string"); // debug
        let nodes = node.querySelectorAll(options.items);
        if (nodes.length == 0)
        {
          console.warn("No slides specified for the carrousel.");
          return;
        }

        this.setSlides(nodes);
      }
      else if(options.items instanceof NodeList || options.items instanceof Array)
      {
        console.log("items is a NodeList"); // debug
        this.setSlides(options.items);
      }
    }
    else
    {
      let nodes = node.querySelectorAll(".carrousel__cell");
      if (nodes.length == 0)
      {
        console.warn("No slides specified for the carrousel.");
        return;
      }

      this.setSlides(nodes);
    }

    if (this.options.contentwidth) // override any calculated (or imported from renderinfo) content width
      this.width_content = this.options.contentwidth;

    this.__determineContainerWidth();

    var virtualwidth = 2147483645;

    if (this.options.blockscrolloncontentleft)
      this.scrollleft = 0; // endless scroll to the right
    else
      this.scrollleft = Math.round(virtualwidth / 2); // enless scroll to all sides

    let initialx = this.scrollleft;

    //let initialx = this.scrollleft;
    if (this.options.initialslide != "none")
    {
      initialx = this.__getLeftForSlide(this.options.initialslide);
      if (isNaN(initialx))
      {
        console.error("Cannot determine initial X position. (internal slides info corrupt?)");
        //return;
      }
    }
    else
    {
      //initialx = this.__getContentScrollToVirtualScroll(this.scrollleft);
      initialx = this.scrollleft - this.scrollleft % this.width_content; // round down to the nearest 0 in content position
    }

    if (this.options.useiscroll)
    {
      let iscrollsettings =
          { useTransition: false // this would request computed style
          , tap: true
          , eventPassthrough: this.options.eventPassthrough

          , deceleration: this.options.scroll_deceleration

          , autoUpdatePosition: false // OVERRIDE
          , overrideMeasurements: true // OVERRIDE

          , wrapperWidth:  this.width_viewport // don't care // FIXME: care because this influences the momentum
          , scrollerWidth: 0 // don't care

          , maxScrollX:    virtualwidth
          , startX:        -initialx

          , scrollX: true
          , scrollY: false

          , snap:           this.options.snap
          //, snapStepX: this.options.slidewidth
          , getNearestSnap: this.getNearestSnap.bind(this)
          , getPage:        this.getPage.bind(this)

          , mouseWheel:     false
          // mouseWheel disabled, because with mouse as input it's usually very jerky
          //, mouseWheel:     this.options.interactable && this.options.mouseWheel
          //mouseWheelSpeed: 20
/*
          , disableMouse:   !this.options.interactable
          , disablePointer: !this.options.interactable
          , disableTouch:   !this.options.interactable
*/
          , name:           "" // for debugging purposes
          };

      if (this.options.debug)
        console.log(iscrollsettings);

      this.iscroll = new IScroll(this.nodes.dragarea, iscrollsettings);
      this.iscroll.tempid = this.options.name + "-iscroll"; // debug

      this.iscroll.on("scrollEnd", this.onScrollEnd.bind(this));

      if (!this.options.interactable || !this.options.draggable)
        this.iscroll.disable();

      this.prevtime = -1;

      if (this.nodes.btn_prev)
        this.nodes.btn_prev.addEventListener("tap", this.__onPreviousSlideClick.bind(this));

      if (this.nodes.btn_next)
        this.nodes.btn_next.addEventListener("tap", this.__onNextSlideClick.bind(this));

      this.nodes.viewport.addEventListener("tap", this.__detectCellTap.bind(this));
    }
    else
    {
      this.scrollleft = 0;
      this.scrollleft_next = initialx;
    }

    if (!this.options.delayfirstframe)
      this.onAnimFrame(0, true);
  }

  destroy()
  {
    // prevent eventlisteners keeping iscroll and us alive
    // (and triggering our onanimframe)
    this.iscroll.destroy();
    cancelAnimationFrame(this.animationframe);

    let idx = window.__spc_carrousels.indexOf(this);
    window.__spc_carrousels.splice(idx, 1);

    /*
    destroy references

    for(let item of this.items)
    {
      for (let node of item.nodecopies)
        delete node.__iteminfo // remove reference from node to it's rendering/item info object within our carrousel

      item.nodecopies = null;
    }
    */

    //this.dead = true;
  }

  getSelfOrChild(node, classname)
  {
    if (node.classList.contains(classname))
      return node;
    else
      return node.querySelector("."+classname);
  }

  setOptions(options)
  {
    //var need_slides_refresh = false;
    //need_slides_refresh = ("gap" in options && gap != this.options.gap);

    Object.assign(this.options, options);

    //if (need_slides_refresh)
    //  this.__refreshSlidesLayout();
  }

  onAnimFrame(timestamp, force)
  {
    var dpr = window.devicePixelRatio;
    if (!dpr)
      dpr = 1; // fallback for IE10

    var currentpos;
    if (this.options.useiscroll)
      currentpos = -Math.round(this.iscroll.x * dpr) / dpr;
    else
      currentpos = Math.round(this.scrollleft_next * dpr) / dpr;
/*
    var currentpos;
    if (this.options.useiscroll)
      currentpos = this.iscroll.x;
    else
      currentpos = this.scrollleft_next;
*/

/*
if (isNaN(currentpos))
{
  if (!this.warned)
  {
    console.error("iScroll X position is NaN !!!");
    this.warned = true;
  }
  return;
}
*/

    if (force || this.scrollleft != currentpos)
    {
//       console.log("Scrolling:", this.iscroll.x, dpr, currentpos);

      //console.log(force, this.scrollleft, currentpos);

      this.scrollleft = currentpos;
      this.__redraw_slides(true);
    }
    else
    {
      if (this.options.ondrawframe)
      {
        var scrollleft = this.scrollleft % this.width_content;
        //var visible_left = scrollleft;
        //var visible_right = visible_left + this.width_viewport;
        this.options.ondrawframe.bind(this)({ scrollleft:   this.scrollleft // scrollposition in the virtual (almost endless) space
                                 , contentleft:  scrollleft // scrollposition in the content (xpos in the content where we start in our container)
                                 , contentwidth: this.width_content
                                 , draw:         false // not drawing
                                 });
      }
    }

    // schedule the next frame
    // (!! don't move this to the start of the function, this might create a race condition)
    this.animationframe = requestAnimationFrame(this.onAnimFrame.bind(this));
  }

  /** @short scroll to the x position in the virtual space
  */
  scrollTo(newx, animate)
  {
    //console.log(this.options.name+".scrollTo", newx, animate);

    if (this.options.useiscroll)
      this.iscroll.scrollTo(-newx, 0, animate ? this.options.transitionDuration : 0);
    else
    {
      console.info(this.options.name + " no iscroll");
      this.scrollleft_next = newx;
      this.__redraw_slides(true);
    }
  }

  scrollBy(offsetx, animate)
  {
    //console.log(this.options.name+".scrollBy", offsetx, animate);

    if (this.options.useiscroll)
    {
      //this.iscroll.scrollTo(-(this.scrollleft + offsetx), 0, animate ? this.options.transitionDuration : 0);

      // We apply the offset to iScroll's internal X since that one hasn't been rounded,
      // allowing us to scroll with subpixel position (even though we position at whole pixels)
      this.iscroll.scrollTo(this.iscroll.x - offsetx, 0, animate ? this.options.transitionDuration : 0);
    }
    else
    {
      console.info(this.options.name + " no iscroll");
      this.scrollleft_next += newx;
      this.__redraw_slides(true);
    }
  }

  /** @short scroll to the (nearest copy of the) content x position
  */
  scrollToContent(newx, forward, animate)
  {
    let xfloor = Math.floor(this.scrollleft / this.width_content) * this.width_content;
    let xceil = xfloor + this.width_content;

    if (forward)
      this.scrollTo(xceil, animate);
    else
      this.scrollTo(xfloor, animate);
  }

  /** @short slide to (a copy of the) specified slide
  */
  jumpToSlide(idx, animate, forward)
  {
    if (idx >= this.items.length)
    {
      console.error("Slide #"+idx+" doesn't exist.");
      return;
    }

    this.activeslideidx = idx; // FIXME: should we do this here?

    var newx = this.__getLeftForSlide(idx, forward);
    this.iscroll.scrollTo(-newx, 0, animate ? this.options.transitionDuration : 0);
  }

  /** @short slide to the virtual slide
  */
  jumpToVirtualSlide(virtualidx)
  {
    if (virtualidx < 0)
    {
      console.error("Negative virtual slide idx not supported.")
      return;
    }
    // ADDME: should we set this.activeslideidx ?

    var newx = this.__getVirtualLeftForSlide(virtualidx);
    this.iscroll.scrollTo(-newx, 0, this.options.transitionDuration);
  }

  previousSlide()
  {
    if (this.slide_virtualstartidx == -1)
      this.slide_virtualstartidx = this.alignedslidevirtualidx;

    this.slide_offset--;

    //console.log("prevSlide", this.alignedslidevirtualidx, this.slide_virtualstartidx, this.slide_offset);

    this.jumpToVirtualSlide(this.slide_virtualstartidx + this.slide_offset, true);
  }

  nextSlide()
  {
    if (this.slide_virtualstartidx == -1)
      this.slide_virtualstartidx = this.alignedslidevirtualidx;

    this.slide_offset++;

    //console.log("nextSlide", this.alignedslidevirtualidx, this.slide_virtualstartidx, this.slide_offset);

    this.jumpToVirtualSlide(this.slide_virtualstartidx + this.slide_offset, true);
  }

  onScrollEnd()
  {
    //console.info("onScrollEnd");
    this.slide_virtualstartidx = -1;
    this.slide_offset = 0;
  }


  __determineContainerWidth()
  {
    this.width_viewport = this.nodes.viewport.clientWidth;

    if (this.options.debugdimensions)
      console.log(this.logprefix, "New carrousel width_viewport is ", this.width_viewport)

//console.log(this.width_viewport);
    if (this.width_viewport == 0)
      console.warn("clientWidth of carrousel viewport is 0.");

    //this.nodes.viewport.style.height = this.largestslideheight + "px";
  }

  refresh()
  {
    this.__determineContainerWidth();

    // virtual numbering is invalidated now.
    // (FIXME: find a way to keep virtualidx stabile, which is possible)
    this.alignedslidevirtualidx = null;
    if (this.alignedslidenode)
      this.alignedslidenode.classList.remove("carrousel__cell--aligned");

    this.jumpToSlide(this.alignedslideidx, false)
    //this.jumpToVirtualSlide(this.alignedslidevirtualidx, false)

    this.__redraw_slides(true);

    // make sure keyboard navigation keeps working ok
    if (this.slide_virtualstartidx != -1)
      this.slide_virtualstartidx = this.alignedslidevirtualidx;
  }

  drawFrame()
  {
    this.__redraw_slides(true);
  }

  // PRIVATE //////////////////////////////////////////////////////////////////////////////////

  importRenderInfo(renderinfo)
  {
    this.width_content = renderinfo.width;
    this.largestslideheight = renderinfo.height; // renderinfo.height; ... TEMP workaround FIXME

//console.info("importLayoutArray", items.length);

    for (let item of renderinfo.items)
    {
      // enrich with some internal data
      item.usecount = 0;
      item.nodecopies = [item.node];

      this.items_onscreen.push(item.node); // push so refresh() will move these out of view if needed

      item.node.__iteminfo = item;
    }

    this.items = renderinfo.items;

    this.__relayoutViewport();
  }

  // @short import items from a Spellcoder Masonry
  //        Items imported this way aren't placed side by side, but their left position is copied.
  //        The top style property will be left untouched.
  importSlidesFromMasonry(renderinfo)
  {
    //console.log(renderinfo);
    if (renderinfo.width == 0)
    {
      console.error("Cannot import data from masonry, it's width is reported to be 0.")
      return;
    }

    this.width_content = renderinfo.width;
    this.largestslideheight = renderinfo.height; // renderinfo.height; ... TEMP workaround FIXME

    /*
    renderinfo.items[] =
        col: 0
        cols: 1
        height: 100
        left:0
        node:div.projectview__project
        top:0
        width:469
    */

    for (let item of renderinfo.items)
    {
      var iteminfo =
        { node:       item.node
        , width:      item.width
        , width_real: item.width
        , height:     item.height
        , left:       item.left
        , right:      item.left + item.width
        , usecount:   0
        , nodecopies: [item.node]
        };
      this.items.push(iteminfo);
      this.items_onscreen.push(item.node); // push so refresh() will move these out of view if needed

item.node.style.left = "0";
      item.node.__iteminfo = iteminfo;
    }

    this.__relayoutViewport();
  }

  // FIXME: if used again remove all old slides from the DOM ?
  setSlides(nodes)
  {
    if (this.options.debugdimensions)
      console.info(this.logprefix, "setSlides")

    let posx = 0;
    let largestheight = 0;
    this.width_content = 0;

    var fixedslidewidth = Math.round(this.options.slidewidth);

    for (let node of nodes)
    {
      var width = node.offsetWidth;
      var height = node.offsetHeight;

      if (height > largestheight)
        largestheight = height;

      var positionwidth = fixedslidewidth > 0 ? fixedslidewidth : width;

      var iteminfo =
        { node:       node
        , width:      positionwidth
        , width_real: width
        , height:     height

        , left:       posx
        , right:      posx + positionwidth

        , usecount:   0      // how many times this slide is shown in the current drawn frame
        , nodecopies: [node] // cache of all copies of the slide (including the original node)
        };

      if (fixedslidewidth > 0)
        iteminfo.left += (positionwidth - width) / 2;

      this.items.push(iteminfo);

      this.items_onscreen.push(node); // push so refresh() will move these out of view if needed

      posx += positionwidth + this.options.gap;

      this.width_content += positionwidth + this.options.gap;

      node.__iteminfo = iteminfo;
    }

    this.largestslideheight = largestheight;

    if (this.options.debugdimensions)
      this._logSlides();

    this.__relayoutViewport();
  }

  _addToLog(msg)
  {
    console.info(this.logprefix + " " + msg);
  }

  _logSlides()
  {
    if (this.options.debugdimensions)
    {
      this._addToLog("largest slide height is " + this.largestslideheight);
      for (let item of this.items)
        this._addToLog("slide is "+item.width+"x"+item.height);
    }
  }

  /** @short call when dimension of slides have changes
  */
  relayoutSlides()
  {
    if (this.options.debugdimensions)
      console.info(this.logprefix, "relayoutSlides")

    let posx = 0;
    let largestheight = 0;
    this.width_content = 0;

    var fixedslidewidth = Math.round(this.options.slidewidth);

    for (var idx = 0; idx < this.items.length; idx++)
    {
      var iteminfo = this.items[idx];
      //console.log("Before", iteminfo);

      var width = iteminfo.node.offsetWidth;
      var height = iteminfo.node.offsetHeight;

      if (height > largestheight)
        largestheight = height;

      var positionwidth = fixedslidewidth > 0 ? fixedslidewidth : width;

      iteminfo.width = positionwidth;
      iteminfo.width_real = width
      iteminfo.height = height;
      iteminfo.left = posx;
      iteminfo.right = posx + positionwidth;
      //console.log("After", iteminfo);

      if (fixedslidewidth > 0)
        iteminfo.left += (positionwidth - width) / 2;

      posx += positionwidth + this.options.gap;

      this.width_content += positionwidth + this.options.gap;
    }

//console.log(this.width_content);

    this.largestslideheight = largestheight;

    if (this.options.debugdimensions)
      this._logSlides();

    this.__relayoutViewport();
  }

  __relayoutViewport()
  {
    this.width_viewport = this.nodes.viewport.clientWidth;

    let newheight = 0;
    if (this.options.height)
    {
      newheight = this.options.height;
    }
    else
    {
      if (this.options.debugdimensions)
        console.info("No options.height set, using the largestslideheight");

      newheight = this.largestslideheight;
    }

    if (this.options.debugdimensions)
      console.log("__relayoutViewport reads width (", this.width_viewport, ") and sets viewport height to", newheight);

    this.nodes.viewport.style.height = newheight + "px";
  }

  // PRIVATE - UI interaction //////////////////////////////////////////////////////////////////

  onKeyPress(evt)
  {
    //if (this.options.debug)
    //  console.log(evt.keyCode, this.options.interactable, this.options.keyboardnavigation);

    if (!this.options.interactable || !this.options.keyboardnavigation)
      return;

    switch (evt.keyCode)
    {
      case 37: // left arrow
      {
        evt.preventDefault();
        evt.stopPropagation();
        this.previousSlide();
        break;
      }

      case 39: // right arrow
      {
        evt.preventDefault();
        evt.stopPropagation();
        this.nextSlide();
        break;
      }

      case 27: // escape
      {
        evt.preventDefault();
        evt.stopPropagation();
        dompack.dispatchCustomEvent( this.node
                                   , "wh:closeslideshow"
                                   , { bubbles:    false // FIXME: or would we ever want this to be true?
                                     , cancelable: false
                                     , detail:     { carrousel:          this // for access if no reference was kept or if our event gets dispatched for 'new Carrousel' has returned "this".
                                                   }
                                     });
        break;
      }
    }
  }

  __onPreviousSlideClick(evt)
  {
    evt.preventDefault();
    evt.stopPropagation();
    this.previousSlide(evt);
  }

  __onNextSlideClick(evt)
  {
    evt.preventDefault();
    evt.stopPropagation();

    var time = new Date().getTime();

/*
Sometimes if eventPassThrough is set to true we get double events? (but only in fullscreen slideshow mode?)

    console.info("__onNextSlideClick", time - this.prevtime);

    if (time - this.prevtime < 200)
    {
      console.log("again??");
      return;
    }
    if (time == this.prevtime)
    {
      console.warn("OI");
      return;
    }
    this.prevtime = time;
*/
//console.trace();
    this.nextSlide(evt);
  }

  __detectCellTap(evt)
  {
    if (!this.options.activateslidewithclick)
      return;

    // lookup this node
    var carrouselcell = dompack.closest(evt.target, ".carrousel__cell");
    if (!carrouselcell)
      return;

    var idx = this.items.indexOf(carrouselcell.__iteminfo);

    if (idx == this.activeslideidx)
      return; // whe're already in view

    console.info(this.items[idx]); // DEBUG

    var viewport_rect = this.nodes.viewport.getBoundingClientRect();
    var clickpos = evt.pageX - viewport_rect.left;

    // Whether the content is left or right of the position where the active slide appears
    // determines whether we scroll forward or backward.
    var forward = false;
    switch(this.options.activeslidealignment)
    {
      case "":
      case "viewport_left":
          forward = true;
          break;

      case "viewport_middle":
          forward = clickpos > this.width_viewport / 2;
          break;

      case "left":
          forward = clickpos > this.options.paddingLeft;
          break;

      case "middle":
          var contentareawidth = this.width_viewport - this.options.paddingLeft - this.options.paddingRight;
          var middlex = contentareawidth / 2 + this.options.paddingLeft;
          forward = clickpos > middlex;
          break;
    }

    //console.log("Tapped at x position " + clickpos + ", will now scroll " + (forward ? "forward" : "backward"));

    //console.log(evt);

    this.jumpToSlide(idx, true, forward);
  }


  __getVirtualLeftForSlide(virtualidx)
  {
    var items = this.items.length;
    var idx = virtualidx % items;
    var pages = Math.floor(virtualidx / items);
    //console.warn(virtualidx, pages, idx);

    var left = (pages * this.width_content) + this.__getActivationCenterForSlide(idx);
    //console.log("__getVirtualLeftForSlide", pages, "*", this.width_content, "+", this.__getActivationCenterForSlide(idx));

    return left;
  }


  __getActivationCenterForSlide(idx)
  {
    var wanted_left_within_content = this.items[idx].left;
    switch(this.options.activeslidealignment)
    {
      case "":
      case "viewport_left":
          break;

      case "viewport_middle":
          wanted_left_within_content -= (this.width_viewport - this.items[idx].width_real) / 2;
          break;

      case "left":
          wanted_left_within_content -= this.options.paddingLeft;
          break;

      case "middle":
          var contentareawidth = this.width_viewport - this.options.paddingLeft - this.options.paddingRight;
          //console.log("middle contentareawidth", contentareawidth, this.options.paddingLeft, this.options.paddingRight);
          wanted_left_within_content -= (contentareawidth - this.items[idx].width_real) / 2 + this.options.paddingLeft;
          break;
    }
    return wanted_left_within_content;
  }

  __getLeftForSlide(idx, forward)
  {
    var orig_idx = idx; // DEBUG

    // get the real item index
    var idx_neg = idx < 0;
    var pages;
    if (idx < 0)
    {
      idx++;
      idx = (this.items.length-1) - (-idx % this.items.length);
      pages = -Math.floor(-idx % this.items.length);
    }
    else
    {
      idx = idx % this.items.length;
      pages = Math.floor(idx / this.items.length);
    }

//    console.info(orig_idx, idx, pages, forward);
//console.warn(this.width_viewport);

    // FIXME: although it works, I feel it's not quite the best way
//console.log("__getLeftForSlide " + idx + " of " + this.items.length + " items.");
    var wanted_left_within_content = this.__getActivationCenterForSlide(idx);

//console.log(idx, pages, wanted_left_within_content, this.scrollleft, this.width_content);

    //console.log(this.options.activeslidealignment, wanted_left_within_content);

    //console.log("Position change:", this.items[idx].left - (this.scrollleft % this.width_content) - this.options.paddingLeft);
    var left = this.scrollleft + wanted_left_within_content - (this.scrollleft % this.width_content);

    if (forward && left < this.scrollleft)
      left += this.width_content;
    else if (!forward && left > this.scrollleft)
      left -= this.width_content;

    return left;
  }

  // NOTE: not finished
  __getContentScrollToVirtualScroll(wanted_left_within_content, forward)
  {
// ADDME: forward
    return this.scrollleft - this.scrollleft % this.width_content + wanted_left_within_content;
  }


  /** @short
      @param x the page number

      TEST:
      ctest.iscroll.goToPage(12, 0)
  */
  getPage(pageX, pageY)
  {
    console.info("getPage");

    if (pageX < 0)
    {
      console.error("pageX should not be negative.");
      pageX = -pageX;
    }

    var repeatedcontent = Math.floor(pageX / this.items.length);
    var itemidx = pageX % this.items.length;

    console.log("iScroll pageX", pageX, "is actually contentrepetition", repeatedcontent, " slide #"+itemidx);

    var val =
        { x:     - ((repeatedcontent * this.width_content) + this.items[itemidx].left)
        , y:     0
        , pageX: pageX //-Math.floor(x / this.width_content)
        , pageY: pageY
        };

    console.info("getPage", pageX, " returns ", val);

    return val;
  }

// iScroll.currentPage = nearest snap

  getNearestSnap(x, y, iScroll)
  {
/*
    if (this.options.snapto == "contentstart")
    {
      // (same calculation as in scrollToContent)
      let xfloor = Math.floor(this.scrollleft / this.width_content) * this.width_content;
      let xceil = xfloor + this.width_content;

      let distance_to_previous_contentstart = xceil - this.scrollleft;
      let distance_to_next_contentstart = this.scrollleft - xfloor;
      let closest = distance_to_next_contentstart < distance_to_previous_contentstart ? xceil : xfloor;

      console.log(this.scrollleft, xfloor, xceil);
      console.log(distance_to_previous_contentstart, distance_to_next_contentstart, closest);

      var val =
          { x:     -closest
          , y:     0
          , pageX: 1
          , pageY: 0
          }
      return val;
    }
*/
    console.info("getNearestSnap");

    x = -x;
    var renderinfo = this.__redraw_slides(false, x);

    //console.log(renderinfo);
    var val =
         {// x:     -this.__getLeftForSlide(renderinfo.newactiveslidevirtualidx)
           x:     -this.__getVirtualLeftForSlide(renderinfo.newactiveslidevirtualidx)
         , y:     0
         , pageX: renderinfo.newactiveslidevirtualidx
         , pageY: 0

         //, _carr_contentrepeat: Math.floor(x / this.width_content)
         //, _carr_slideidx:      nearestslideidx
         };

    //console.log("getNearestSnap", val);

    return val;
  }

  __getActivationX()
  {
    var activation_x = 0;//
    switch(this.options.activeslidealignment)
    {
      case "":
      case "viewport_left":
          break;

      case "viewport_middle":
          activation_x = this.width_viewport / 2;
          break;

      case "left":
          activation_x = this.options.paddingLeft;
          break;

      case "middle":
          var contentareawidth = this.width_viewport - this.options.paddingLeft - this.options.paddingRight;
          //console.log("middle contentareawidth", contentareawidth, this.options.paddingLeft, this.options.paddingRight);
          activation_x = contentareawidth / 2 + this.options.paddingLeft;
          break;
    }
    return activation_x;
  }


  __redraw_slides(draw, override_scrollleft)
  {
    // virtual positions
    // Our scrolleft must be a round number to prevent blurring
    // (which will be especially visible when scrolling has ended)
    var absolute_scrollleft = (override_scrollleft ? override_scrollleft : this.scrollleft);
    var scrollleft = absolute_scrollleft % this.width_content;
    var visible_left = scrollleft;
    var visible_right = visible_left + this.width_viewport;

    if (this.options.ondrawframe && draw)
      this.options.ondrawframe.bind(this)({ scrollleft:   absolute_scrollleft // scrollposition in the virtual (almost endless) space
                               , contentleft:  scrollleft // scrollposition in the content (xpos in the content where we start in our container)
                               , contentwidth: this.width_content
                               , draw:         true // not drawing
                               });


    if (this.items.length == 0)
    {
      //console.warn("No slides to draw.");
      return;
    }


    var activation_x = this.__getActivationX();

    //console.log(scrollleft, this.options.activeslidealignment, this.width_content, activation_x);


    var new_items_onscreen = [];

    var items_visible = 0;
    var itemcount = this.items.length;
    var draw_itemidx = 0; //first_idx;

    if (this.options.debugdraw)
    {
      console.log( "__redraw_slides()"
                 , { scrollleft:     scrollleft
                   , content_offset: scrollleft

                   , width_content:  this.width_content

                   , visible_left: visible_left
                   , visible_right: visible_right
                   });
    }


    // reset the usage counter for each item
    for (var idx = 0; idx < this.items.length; idx++)
      this.items[idx].usecount = 0;

    var offsetleft = 0;

    var newactiveslideidx = -1;
    var newactivenode = null;
    var newactiveslidevirtualidx = null;
    var newactiveslide_dist = -1;

    var virtualslideidx = Math.floor( absolute_scrollleft / this.width_content) * this.items.length;

    while(items_visible < 1000) // FIXME: arbitrary workaround to prevent a loop when all items have width 0
    {
      var item = this.items[draw_itemidx];

//      console.log((item.left + offsetleft) + " to " + (item.right + offsetleft));

      if (item.right + offsetleft < visible_left)
      {
        // Prepare for the next potential item to draw
        draw_itemidx++;
        virtualslideidx++;
        if (draw_itemidx == itemcount)
        {
          draw_itemidx = 0;
          offsetleft += this.width_content;
        }
        continue;
      }

      // for simple side-by-side scrollers (like a slideshow) we can assume all items after the first out-of-view item is also out-of-view
      let outofview = item.left + offsetleft > visible_right;
      if (outofview && this.options.items_positions_ordered)
        break; // whe are done. whe've gone beyond the visible edge of the viewport.
      // else !!! FIXME: implement detecting all items in the content being out of view.... or we only stop at our 1000 items cutoff point.

      if (!outofview)
      {
        var left_in_viewport = item.left + offsetleft - scrollleft;

        // idx in the "infinite" space - calculated to return for debug/render inspection
        //var virtualslideidx = Math.floor(scrollleft + offsetleft + left_in_viewport) / this.width_content * this.items.length + draw_itemidx); // virtual world idx

        // DRAW ---------------------------------------------------------------------
        if (draw)
        {
          var use_node;
          if (item.usecount < item.nodecopies.length)
          {
            // we can reuse a node
            use_node = item.nodecopies[item.usecount];
          }
          else
          {
            // create a new copy of the slide to use
            use_node = item.node.cloneNode(true);
            use_node.__iteminfo = item;
            item.nodecopies.push(use_node);
            this.nodes.content.appendChild(use_node);
          }
  /*
          if (this.options.debugslides)
          {
            var titlenode = item.node.querySelector(".carrousel__cell-title");
            if (titlenode)
            {
              // show the virtual slide idx and the idx of the real slide being drawn
              titlenode.innerText = virtualslideidx + " / " + draw_itemidx;
            }
          }
  */

          var centerwithinheight = this.options.height ? this.options.height : this.largestslideheight;

          var offsety = 0;
          if (this.options.vertical_align == "middle")
            offsety = Math.round(centerwithinheight - item.height) / 2; // FIXME: retina positioning
          else if (this.options.vertical_align == "bottom")
            offsety = Math.round(centerwithinheight - item.height);

          let transform = "translate3D("+left_in_viewport+"px,"+offsety+"px,0)";

          if (item.scale)
            transform += " scale("+item.scale+")";

          //use_node.style.webkitTransform = transform; // FIXME: reenable for iOS 8
          use_node.style.transform = transform;

          // FIXME: This should NOT be done here, implement a callback or event which passes the node which are or will become visible
          //        and let the fsslideshow code handle this.
          var imagecontainer = use_node.querySelector(".carrousel__cell-image");
          if (imagecontainer)
            imagecontainer.style.backgroundImage = ""; // FIXME: too specific to use here?? used to allow loading the bgimage from a class/id

    //      console.log("Drawing item #" + draw_itemidx + " using copy #" + item.usecount + " at left: " + left_in_viewport + "px");
    //      console.log(use_node);

          new_items_onscreen.push(use_node);
          item.usecount++;
        }
        // --------------------------------------------------------------------------


        // The slide closest to the activation area will be picked as the alignemnt slide
        var leftdist = Math.abs(activation_x - left_in_viewport);
       // var rightdist = Math.abs(activation_x - (left_in_viewport + item.width + this.options.gap/2))
        var dist = leftdist;// > rightdist ? rightdist : leftdist;

        if (newactiveslide_dist == -1 || dist < newactiveslide_dist)
        {
          //console.log("actsl", virtualslideidx);
          newactiveslideidx = draw_itemidx;
          newactivenode = use_node;
          newactiveslidevirtualidx = virtualslideidx;
          newactiveslide_dist = dist;
        }
      }


      // Prepare for the next potential item to draw
      draw_itemidx++;
      virtualslideidx++;
      if (draw_itemidx == itemcount)
      {
        draw_itemidx = 0;
        offsetleft += this.width_content;
      }

      items_visible++;
    }

    //console.log(items_visible, "slides visible.");

    if (items_visible == 0)
    {
      //console.error("No items to draw??");
      return;
    }

//console.log("Old onscreen assets", this.items_onscreen);
//console.log("New onscreen assets", new_items_onscreen);

    if (draw)
    {
      // remove previously used, but now unused sprites from the view
      // NOTE: we cannot use visibility or display for this, on iOS this will flush caches and making
      //       a sprite reappear would cause flicker and stuttering.
      for (var idx = 0; idx < this.items_onscreen.length; idx++)
      {
        var asset = this.items_onscreen[idx];
        if (new_items_onscreen.indexOf(asset) == -1)
        {
          asset.style.webkitTransform = "translate3D(-50000px,0,0)";
          asset.style.transform = "translate3D(-50000px,0,0)";
        }
      }

      this.items_onscreen = new_items_onscreen;

      if (newactiveslideidx > -1 && newactiveslidevirtualidx != this.alignedslidevirtualidx)
      {

        //console.log("Distance of active slide to activity-center: ", newactiveslide_dist, newactiveslidevirtualidx);
        //console.log("Activate slide set to ", newactiveslideidx);
        this.__setActiveSlide(item, newactiveslideidx, newactivenode, newactiveslidevirtualidx);
      }
    }

    return { newactiveslideidx: newactiveslideidx
           , newactivenode:     newactivenode
           , newactiveslidevirtualidx: newactiveslidevirtualidx
           , newactiveslide_dist:      newactiveslide_dist
           };
  } // end of refresh()


  __setActiveSlide(item, newactiveslideidx, newactivenode, virtualslideidx)
  {
    //console.log("Firing wh:activeslidechange");

    //console.log("New active slide", newactiveslideidx, newactivenode);

    if (this.alignedslidenode != newactivenode)
    {
      if (this.alignedslidenode)
        this.alignedslidenode.classList.remove("carrousel__cell--aligned");

      newactivenode.classList.add("carrousel__cell--aligned");
    }
    //console.log("DISPATCH TO", this.node);

    dompack.dispatchCustomEvent( this.node
                               , "wh:activeslidechange"
                               , { bubbles:    false // FIXME: or would we ever want this to be true?
                                 , cancelable: false
                                 , detail:     { carrousel:          this // for access if no reference was kept or if our event gets dispatched for 'new Carrousel' has returned "this".
                                               , previousactive:     this.alignedslide
                                               , previousactiveidx:  this.alignedslideidx
                                               , previousactivenode: this.alignedslidenode
                                               , nextactive:         item
                                               , nextactiveidx:      newactiveslideidx
                                               , nextactivenode:     newactivenode
                                               }
                                 });

    this.activeslide = item;
    this.alignedslideidx = newactiveslideidx;
    this.alignedslidenode = newactivenode;
    this.alignedslidevirtualidx = virtualslideidx;
  }
}
