library(cfb4th)
library(jsonlite)

outfile <- 'data/cfb4th-benchmark-grid.json'

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

scenarios <- expand.grid(
  yardLine=c(35, 45, 58, 70, 82),
  yardsToGo=c(1, 2, 4, 7),
  quarter=c(2, 4),
  timeRemaining=c('12:00', '08:00', '03:00', '01:30'),
  scoreDifferential=c(-10, -3, 0, 3),
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
    id = sprintf('G%03d', i),
    input = list(
      yardLine = s$yardLine,
      yardsToGo = s$yardsToGo,
      quarter = s$quarter,
      timeRemaining = s$timeRemaining,
      scoreDifferential = s$scoreDifferential
    ),
    cfb4thTarget = list(
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
  notes = 'Broader cfb4th benchmark grid with neutral placeholder team inputs (Utah vs BYU), generated 2026-03-16.',
  scenarioCount = length(rows),
  scenarios = rows
)

write(toJSON(obj, auto_unbox=TRUE, pretty=TRUE), outfile)
cat('wrote', outfile, 'with', length(rows), 'scenarios\n')
