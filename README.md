# kalulu js

This is work in progress. APIs might change.

An opiniated javascript library to quickly create graphical widgets using
normal canvas and image api's. It makes it easy to:

* do setup and image loading
* handle both mouse and touch events using ondown/onmove/onup
* draw and interact with multiple layers
* layout the layers using a subset of flexbox (TODO: half done)
* textlayers/imagelayers (TODO: half done)

It also extends the default javascript environment with a few things like:

* `assert()`: thow an exception if the conditional is false, e.g. `assert(x >= 0)`
* `rnd()/rndint()`: random numbers in ranges, e.g. `rndint(5,10)` is on of `5,6,7,8,9`
* Some tool for lists of numbers: `Array.prototype.sum()/max()/min()`
* And generally: `Array.prototype.suffle()/stablesort()`
* timers: `after(seconds, cb)/every(seconds, cb)`

And more things like this to make js a bit more "nice" and productive.

# Kalulu

Kalulu is a character from ancient Bantu (African) stories. They are about a
hare that is a trickster.
