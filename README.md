# What does it do

It can create the illusion of endless scrolling (wrapping).
To do this it handles scrolling (through mouse, scrollwheel, touch and keyboard) and handles cloning nodes and repositioning content.


# Usage

FIXME: at the moment the X position of elements must be sorted to function correctly?


- in new SpellcoderCarrousel(node, options)
- in data-carrousel-options JSON encode


```
ADDME
```

# Usage of Carrousel


# Use-Cases

- as image carrousel (horizontal strip with images which wrap/repeat)
- as slideshow
- grid/masonry of items which wraps


# Additional suggestions for usage

A) For slides that don't resize with the viewport:

     - cell container with the explicit width, for mobile override with a max-width: 75vw;
     - cell-image use width: 100% and padding-top: to keep it's aspect ratio
     - other elements in the cell must also max-width: 100%;

B) Slides that are flexible in width & height (usually for fullscreen vieweing)

     - have data-width and data-height on each cell-image and have JS resize (with correct aspect ratio)


# Known issues

- Trackpad has to be handled yourself by now

- IE10/11 may return 0 as clientWidth for the scrollarea.
  The workaround is to add a &nbsp; at the end of the scrollarea content.

- Bug with not activating the active slide initially

- (missing feature) refresh() assumes snap is set to true and scrolls to fix the slide to snap again

- be carefull, there might be hangs when our contentwidth is 0 ? (might already have been fixed though)


# Future enhancements

- option for keyboard navigation to be 'per slide/element' or '% of viewport' or 'amount of pixels'?
- more keyboard navigation (shift+left/right arrow, apple+left/right)
- autoplay (usefull when used as slideshow)
- upon resizing try to keep the centerpoint in the % position on screen it was on when the resize started
- function to call which detects new slides (ignores copies we made). But how 
