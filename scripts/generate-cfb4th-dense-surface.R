library(cfb4th)
library(jsonlite)

outfile <- 'data/cfb4th-dense-surface.json'

make_secs <- function(q, mmss) {
  p <- strsplit(mmss, ':')[[1]]
  qsec <- as.numeric(p[1]) * 60 + as.numeric(p[2])
  list(
    TimeSecsRem = switch(as.character(q),
      '1' = qsec + 900,
      '2' = qsec,
      '3' = qsec + 900,
      '4' = qsec
    ),
    adj_TimeSecsRem = switch(as.character(q),
      '1' = qsec + 2700,
      '2' = qsec + 1800,
      '3' = qsec + 900,
      '4' = qsec
    )
  )
}

make_play <- function(yardLine, yardsToGo, quarter, timeRemaining, scoreDifferential) {
  secs <- make_secs(quarter, timeRemaining)
  data.frame(
    home='Utah', away='BYU', pos_team='Utah', def_pos_team='BYU',
    spread=-3, over_under=52,
    half=ifelse(quarter <= 2, 1, 2),
    period=quarter,
    TimeSecsRem=secs$TimeSecsRem,
    adj_TimeSecsRem=secs$adj_TimeSecsRem,
    down=4,
    distance=yardsToGo,
    yards_to_goal=100 - yardLine,
    pos_score_diff_start=scoreDifferential,
    pos_team_receives_2H_kickoff=1,
    pos_team_timeouts_rem_before=3,
    def_pos_team_timeouts_rem_before=3
  )
}

yardLines <- c(seq(20, 90, by = 2))
yardsToGo <- c(1, 2, 3, 4, 5, 7, 10)
quarters <- c(2, 4)
timeRemaining <- c('12:00', '08:00', '05:00', '03:00', '01:30', '00:45')
scoreDiffs <- c(-14, -10, -7, -3, 0, 3, 7)

scenarios <- expand.grid(
  yardLine = yardLines,
  yardsToGo = yardsToGo,
  quarter = quarters,
  timeRemaining = timeRemaining,
  scoreDifferential = scoreDiffs,
  stringsAsFactors = FALSE
)

rows <- vector('list', nrow(scenarios))
for(i in seq_len(nrow(scenarios))) {
  s <- scenarios[i, ]
  play <- make_play(s$yardLine, s$yardsToGo, s$quarter, s$timeRemaining, s$scoreDifferential)
  res <- suppressWarnings(add_4th_probs(play))
  go_wp <- as.numeric(res$go_wp[1])
  punt_wp <- as.numeric(res$punt_wp[1])
  fg_wp <- as.numeric(res$fg_wp[1])
  vals <- c(`Go for It`=go_wp, `Punt`=punt_wp, `Field Goal`=fg_wp)
  rows[[i]] <- list(
    key = paste(s$yardLine, s$yardsToGo, s$quarter, s$timeRemaining, s$scoreDifferential, sep='|'),
    input = list(
      yardLine = s$yardLine,
      yardsToGo = s$yardsToGo,
      quarter = s$quarter,
      timeRemaining = s$timeRemaining,
      scoreDifferential = s$scoreDifferential
    ),
    output = list(
      recommendation = names(vals)[which.max(vals)],
      goWinProb = round(go_wp, 4),
      puntWinProb = round(punt_wp, 4),
      fgWinProb = round(fg_wp, 4),
      firstDownProb = round(as.numeric(res$first_down_prob[1]), 4),
      fgMakeProb = round(as.numeric(res$fg_make_prob[1]), 4)
    )
  )
}

obj <- list(
  notes = 'Dense cfb4th surface for near-source lookup/interpolation; neutral placeholder team inputs (Utah vs BYU), generated 2026-03-18.',
  scenarioCount = length(rows),
  dimensions = list(
    yardLines = yardLines,
    yardsToGo = yardsToGo,
    quarters = quarters,
    timeRemaining = timeRemaining,
    scoreDiffs = scoreDiffs
  ),
  scenarios = rows
)

write(toJSON(obj, auto_unbox=TRUE, pretty=FALSE), outfile)
cat('wrote', outfile, 'with', length(rows), 'scenarios\n')
