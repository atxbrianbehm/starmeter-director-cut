# STARmeter Scroll Take

## North star

Treat this as a scroll version of Social Post: a local authoring surface for one tall, cinematic STARmeter page. The designer composes a hero, a generated middle population, and two named exit targets, then scrubs the camera down that page over a short shot.

## Composition

- Entrance: three wide STARmeter-style opening cards. They default to Andy Samberg, Matt Damon, and “Weird” Al Yankovic; each card's name, credits, rank, and portrait can be replaced locally from one tabbed control block.
- Middle: a deterministic generated population of small STARmeter cards. The count is an explicit authoring control, not an implied hard-coded crowd.
- Exit: David James Ward and Brock LaBorde are the final dark target cards, placed far below the hero. Their names, credits, ranks, and portraits are editable through the same shot-people control as the opening trio.
- Camera: the stage is a 16:9 window onto a much taller centered page. The page remains one centered column, like a wide desktop version of the supplied mobile reference.

## Motion model

- Shot length defaults to 81 frames at 24fps (3.375 seconds). Dave can explicitly set 48–240 frames, and every dependent timeline/export value follows that duration.
- The playhead is frame-addressable and scrubbable.
- The camera begins on the selected opening actor, accelerates through the generated population, and settles on the target pair at a configurable settle frame.
- Default settle is frame 66, leaving 15 frames to breathe on the destination.
- Cartoony easing exaggerates the dive; smooth and linear are alternate auditions.
- Motion blur is a visible authoring toggle, not a decorative afterthought.

## Authoring controls

Borrow the useful Social Post mental model: frame-first transport, a visible ruler/playhead, and compact inspector values. The current STARmeter editor exposes an exact shot-frame field with a live seconds conversion, settle timing, easing, motion blur, generated population count, and a locally saved five-person editor for opening and ending names, credits, ranks, and portraits.

On a new browser session, a compact Dave-facing startup guide explains the three-step workflow: set the named people, set and audition the duration, and export the take. It can always be reopened from the top bar.

Internal shot annotations never appear on the page cards or in export. Behavioral tags still drive styling and motion, but labels such as start, nearby, crowd, target, and landing-lock copy remain invisible.

## Export

`Export` renders the current page setup to 1920x1080 H.264/MP4 at 24fps using the same timing and motion-blur treatment as the authoring preview. The default is 81 frames / 3.375 seconds; a changed shot-frame value produces that exact new duration. A frame-addressed encoder assigns an explicit timestamp and duration to every canvas frame before MP4 muxing, so export speed cannot shorten the shot. The filename carries the version, frame count, and duration (for example `starmeter-shot-v3-81f-3.375s-1920x1080.mp4`).

## Crowd portrait pool

The generated crowd uses four 16:9 source sheets, each containing six generic Hollywood-style people. A crop script derives 24 true 2:3 portraits under `public/assets/crowd-portraits/`; cards select from that pool deterministically so the page feels varied without changing between renders.

## Visual language

Use Social Post’s “Edit Bay Instrument Panel” language: warm near-black shell, quiet hairlines, compact mono metadata, operational lime for the active state, and a visually dominant composition stage.
