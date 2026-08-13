# EDM form and pattern model

Use this reference when the user names a genre, asks for a section window such as “from the buildup through the second drop,” or leaves section/pattern lengths partly unspecified. This is a lighting-authoring prior, not audio analysis and not a claim about every track in a genre.

## Precedence and uncertainty

Apply evidence in this order:

1. explicit user bar/tick anchors and section lengths;
2. an existing Arrangement's markers, Clips, and confirmed preservation boundary;
3. a user-confirmed subtype or reference form;
4. the profile defaults below.

Never override an explicit boundary with a genre convention. Lumina Full Arrange does not detect audio structure, so label profile-derived boundaries as **proposed defaults**. If the user requests exact synchronization to a real track but supplies no section anchors, ask for bar numbers or a section map.

Resolve section ordinals before calculating. If a track can contain two buildups and the user says only “from the buildup to the second drop,” ask whether they mean buildup 1 or the buildup immediately before drop 2 unless an absolute bar anchor or existing section map makes it unambiguous.

## Distinguish three lengths

- **Section length**: the whole buildup, drop, breakdown, or other named region.
- **Phrase quantum**: the usual boundary grid for major structural decisions, commonly 8 bars in House-family lighting plans.
- **Pattern cycle**: how long one readable visual motif lasts before it repeats or transforms. This is shorter than a section and does not imply one new Cue per beat.

Record all three in the Arrangement brief. A 16-bar House buildup with a 4-bar pattern cycle means four evolving passes inside one buildup, not four unrelated sections.

## Profile priors

Lengths are candidate lighting-form defaults in bars. The first value is preferred. `B1/D1/Break/B2/D2` means first buildup, first drop/peak return, breakdown, second buildup, and second drop/peak return.

| Profile                   | Phrase quantum | B1      | D1    | Break   | B2      | D2    | Typical pattern cycle       |
| ------------------------- | -------------: | ------- | ----- | ------- | ------- | ----- | --------------------------- |
| Generic House             |              8 | 16/8/32 | 16/32 | 16/8/32 | 8/16/32 | 16/32 | buildup 4; drop 8           |
| Tech House                |              8 | 8/16    | 16/32 | 8/16    | 8/16    | 16/32 | buildup 4; groove/drop 8    |
| Progressive/Melodic House |              8 | 16/32   | 32/16 | 16/32   | 16/32   | 32/16 | buildup 4–8; drop 8         |
| Big Room House            |              8 | 16/8    | 16/32 | 8/16    | 8/16    | 16/32 | buildup 4; drop 8           |
| Future House              |              8 | 8/16    | 16/32 | 8/16    | 8/16    | 16/32 | buildup 4; drop 8           |
| Trance                    |             16 | 32/16   | 32/16 | 32/16   | 16/32   | 32/16 | buildup 8; main section 16  |
| Techno                    |              8 | 16/8/32 | 32/16 | 16/8/32 | 8/16    | 32/16 | transition 4; peak groove 8 |
| Dubstep / Drum & Bass     |              8 | 16/8    | 16/32 | 8/16    | 8/16    | 16/32 | buildup 4; drop 8           |

For Techno, “drop” in this shared model means a peak-groove return, not necessarily a pop/EDM drop. If the user supplies a subtype not listed, use the nearest profile only after stating the mapping.

## Generic House window: buildup 1 through drop 2

When the user says only “House, start at buildup 1 and continue through the end of drop 2,” the default candidate is:

| Relative bars | Section   | Length | Pattern cycle | Lighting function                                         |
| ------------- | --------- | -----: | ------------: | --------------------------------------------------------- |
| 1–16          | Buildup 1 |     16 |             4 | four legible passes; reserve one contrast for the drop    |
| 17–32         | Drop 1    |     16 |             8 | establish an 8-bar thesis, then vary it for 8 bars        |
| 33–48         | Breakdown |     16 |             8 | subtract dimensions and reset attention                   |
| 49–56         | Buildup 2 |      8 |             4 | faster restatement without copying buildup 1 mechanically |
| 57–72         | Drop 2    |     16 |             8 | retain identity and transform targeting/color/response    |

For example, if buildup 1 begins at bar 33, the inclusive boundaries are B1 `33–48`, D1 `49–64`, breakdown `65–80`, B2 `81–88`, and D2 `89–104`. Bar 104 ends at tick `104 × ticks_per_bar`; the next section would begin at bar 105. This inclusive-bar/exclusive-tick distinction prevents one-bar gaps and overlaps.

## Internal buildup patterns

Use section-length and pattern-cycle decisions together:

- **16-bar buildup, 4-bar cycle**: establish → widen/brighten → intensify with one or two legal parameter steps → narrow or subtract before the drop. The final fill/gap is part of the fourth cycle unless the user marks it separately.
- **8-bar buildup, 4-bar cycle**: establish one clear motion for four bars, then transform one or two dimensions for four bars. Avoid compressing four unrelated ideas into eight bars.
- **32-bar buildup, 8-bar macro cycle**: four long phases with sparse internal changes; use this only when the subtype, track map, or user explicitly supports a long build.

Pattern cycles should divide the section cleanly unless the source track has a confirmed asymmetric phrase. Place major changes on cycle or half-cycle boundaries. Beat-scale accents may decorate a phrase ending, but they do not redefine the section length.

## Deterministic boundary calculation

Use the bundled helper instead of hand-counting inclusive bars:

```sh
node .agents/skills/lumina-full-arrange/scripts/derive-form-window.mjs \
  --profile house --from-section buildup_1 --through-section drop_2 \
  --start-bar 33 --ppq 960 --numerator 4 --denominator 4
```

With no `--end-bar`, the helper applies the profile defaults and labels the result `profile_default`. With `--end-bar`, it searches legal candidate lengths and requires an exact total:

```sh
node .agents/skills/lumina-full-arrange/scripts/derive-form-window.mjs \
  --profile house --start-bar 33 --end-bar 96
```

If no candidate combination fits, do not stretch a section or silently create a fragment. Ask which section may be shortened, lengthened, or intentionally asymmetric.

The same helper can derive a narrower named window. For example, `--from-section buildup_2 --through-section drop_2 --start-bar 81` returns the preferred 8-bar second buildup followed by the 16-bar second drop.

## Brief and validation requirements

The Arrangement brief must state:

- selected profile and whether it is user-confirmed or a proposed default;
- absolute inclusive bar range and exclusive tick range;
- section length, phrase quantum, and pattern cycle for every section;
- transformation from drop 1 to drop 2;
- any asymmetric phrase and the evidence authorizing it.

Before handoff, verify contiguity, exact requested endpoint, tick conversion, pattern-cycle divisibility, and that Clip/automation changes land on the intended musical boundary. Genre-appropriate shape is a separate check from Schema validity.
