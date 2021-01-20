# What does it do

It can create the illusion of endless scrolling (wrapping) horizontally.
To do this it handles:
- scrolling (through mouse, scrollwheel, touch and keyboard) using iscroll
- positioning of content
- placing cloned content when needed to fill up the viewport horizontally
- aligning the active element (for example with content on your page)


# Use-Cases

- as image carrousel (horizontal strip with images which wrap/repeat)
- as carrousel for articles
- as slideshow (or use dompack-carrousel-slideshow). Ofcourse you could also use CSS snap points for this, unless you want the slideshow wrap if you keep scrolling.
- grid/masonry of items which wraps


# Usage of Carrousel

# Usage

Simple example:
(see chapter 'Usage examples' for more examples)

```
import Carrousel from "@webhare/dompack-carrousel";

let carrousel = new Carrousel(viewport
    , { gap:          0
      , activeslidealignment:  "viewport_left"
      };
```

DOM:

```
[component videocarrousel]
  <div class="carrousel__viewport">
    [forevery slide]
      <div class="carrousel__cell">
        <div class="videoscarrousel__item__image"
             style="background-color: [image.dominantcolor];
                    background-image: url([image.link]);"
             >
        </div>
      </div>
    [/forevery]

    <div class="carrousel__previous"><span class="fa fa-chevron-left"></span></div>
    <div class="carrousel__next"><span class="fa fa-chevron-right"></span></div>
  </div>
```

You can add additional (JSON encoded) setting to the data-carrousel-options attribute of the viewport node.

```
<div class="carrousel__viewport" data-carrousel-options='{"activeslidealignment": "middle"}'>
</div>
```


# Restrictions

- meant to be used with * { box-sizing: border-box }
- FIXME: at the moment the X position of elements must be sorted to function correctly?
- Trackpad has to be handled yourself by now, which can only reliably be done by detecting scroll on a focussed element


# Additional suggestions for usage

A) For slides that don't resize with the viewport:

     - cell container with the explicit width, for mobile override with a max-width: 75vw;
     - cell-image use width: 100% and padding-top: to keep it's aspect ratio
     - other elements in the cell must also max-width: 100%;

B) Slides that are flexible in width & height (usually for fullscreen vieweing)

     - have data-width and data-height on each cell-image and have JS resize (with correct aspect ratio)

- slide nodes will get extra data which can be used to lookup to which slide the node belongs.
This can be usefull in handling an event (for example a click) within the carrousel to see in which slide the click was done. You can use the slideidx if you have to look up information related to a slide or the virtualslideidx if you want to use the idx to scroll the carrousel to another slide.

```

{ slideidx:        // the idx of the original slide (the Xth .carrousel__cell)
, virtualslideidx:
}
```



# Usage examples


A simple carrousel with the initial active slide starting at the left

```
let carrousel = new Carrousel(viewport
    , { gap:          0
      , buttonprevious: widget.node.querySelector(".carrousel__previous")
      , buttonnext:     widget.node.querySelector(".carrousel__next")
      , activeslidealignment:  "viewport_left"
      };
```

Keeping the initial active slide aligned with the content above/below it, while the carrousel extends to the full page/viewport width.

```
let computed = window.getComputedStyle(measure_element);

let carrousel = new Carrousel(viewport
    , { gap:          0
      , paddingLeft:  parseInt(computed.marginLeft, 10)  + parseInt(computed.paddingLeft, 10)
      , paddingRight: parseInt(computed.marginRight, 10) + parseInt(computed.paddingRight, 10)
      , buttonprevious: widget.node.querySelector(".carrousel__previous")
      , buttonnext:     widget.node.querySelector(".carrousel__next")
      , activeslidealignment:  "viewport_left"
      };
```

An carrousel in which the initial active slide is in the middle.
(in case the padding at the left and right isn't equal, you can add paddingLeft and paddingRight)

```
widget.carrousel = new Carrousel(viewport
    , { name:         "videos"
      , gap:          0
      , activeslidealignment: "middle"
      };
```



## Move the slide to the center upon clicking on/in it

```
// iScroll replacement for "click", for quick response and it won't be triggered during a drag/swipe
widget.node.addEventListener("tap", doCheckForCarouselVideoTrigger);

function doCheckForCarouselVideoTrigger(event)
{
  var slidecontainer = dompack.closest(event.target, ".carrousel__cell");
  if (!slidecontainer)
    return;

  if (dompack.closest(event.target, ".carrousel__cell__playbutton"))
  {
    event.preventDefault();
    event.stopPropagation();

    // Move the slide in which we started the video to the center
    videocarrousel.carrousel.jumpToVirtualSlide(slidecontainer._wh_carrouseldata.virtualslideidx);

    ...
```



# Known issues

- IE10/11 may return 0 as clientWidth for the scrollarea.
  The workaround is to add a &nbsp; at the end of the scrollarea content.

- Bug with not activating the active slide initially

- (missing feature) refresh() assumes snap is set to true and scrolls to fix the slide to snap again



# Future enhancements ideas

- option for keyboard navigation to be 'per slide/element' or '% of viewport' or 'amount of pixels'?
- more keyboard navigation (shift+left/right arrow, apple+left/right)
- upon resizing try to keep the centerpoint in the % position on screen it was on when the resize started
- method to call to detect, add or report new slides
