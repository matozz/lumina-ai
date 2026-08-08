# Authoring V1 Arrange follow-up evidence

Captured with the debug macOS bundle at 1302×768 after resetting the workspace to the current built-in Catalog. The same dynamic row geometry is covered by the existing 1103×768 minimum-width pass and component tests.

| Screenshot                                                                               | Verified behavior                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [01-four-corner-effects-and-packed-rows.jpg](01-four-corner-effects-and-packed-rows.jpg) | Four Corner Chase uses four 10×10 quadrant TargetSets. Top-left Column Ping-Pong and top-right Seeded Column Rain remain spatially selective while overlapping CueClips occupy separate visual rows. |
| [02-automation-curve-alignment.jpg](02-automation-curve-alignment.jpg)                   | Quadrant Motion keeps both CueClips on one reusable visual row; the Speed automation curve and keyframe center share the same 40px row geometry and inset.                                           |

The runtime keeps the authored FixtureMask widths. The example uses sufficiently dense TargetSets instead of adding special behavior for very small spatial partitions.
