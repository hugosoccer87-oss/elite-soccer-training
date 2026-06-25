with launch_sessions(training_group, title, start_datetime, end_datetime) as (
  values
    ('elite-performance', 'Elite Performance', '2026-06-16T13:00:00Z'::timestamptz, '2026-06-16T14:00:00Z'::timestamptz),
    ('elite-performance', 'Elite Performance', '2026-06-16T14:00:00Z'::timestamptz, '2026-06-16T15:00:00Z'::timestamptz),
    ('future-elite', 'Future Elite', '2026-06-17T00:00:00Z'::timestamptz, '2026-06-17T01:00:00Z'::timestamptz),

    ('elite-performance', 'Elite Performance', '2026-06-17T13:00:00Z'::timestamptz, '2026-06-17T14:00:00Z'::timestamptz),
    ('future-elite', 'Future Elite', '2026-06-18T00:00:00Z'::timestamptz, '2026-06-18T01:00:00Z'::timestamptz),

    ('elite-performance', 'Elite Performance', '2026-06-18T13:00:00Z'::timestamptz, '2026-06-18T14:00:00Z'::timestamptz),
    ('elite-performance', 'Elite Performance', '2026-06-18T14:00:00Z'::timestamptz, '2026-06-18T15:00:00Z'::timestamptz),
    ('future-elite', 'Future Elite', '2026-06-19T00:00:00Z'::timestamptz, '2026-06-19T01:00:00Z'::timestamptz),

    ('elite-performance', 'Elite Performance', '2026-06-19T13:00:00Z'::timestamptz, '2026-06-19T14:00:00Z'::timestamptz),
    ('elite-performance', 'Elite Performance', '2026-06-19T14:00:00Z'::timestamptz, '2026-06-19T15:00:00Z'::timestamptz),
    ('future-elite', 'Future Elite', '2026-06-20T00:00:00Z'::timestamptz, '2026-06-20T01:00:00Z'::timestamptz),

    ('elite-performance', 'Elite Performance', '2026-06-23T13:00:00Z'::timestamptz, '2026-06-23T14:00:00Z'::timestamptz),
    ('elite-performance', 'Elite Performance', '2026-06-23T14:00:00Z'::timestamptz, '2026-06-23T15:00:00Z'::timestamptz),
    ('future-elite', 'Future Elite', '2026-06-24T00:00:00Z'::timestamptz, '2026-06-24T01:00:00Z'::timestamptz),

    ('elite-performance', 'Elite Performance', '2026-06-24T13:00:00Z'::timestamptz, '2026-06-24T14:00:00Z'::timestamptz),
    ('future-elite', 'Future Elite', '2026-06-25T00:00:00Z'::timestamptz, '2026-06-25T01:00:00Z'::timestamptz),

    ('elite-performance', 'Elite Performance', '2026-06-25T13:00:00Z'::timestamptz, '2026-06-25T14:00:00Z'::timestamptz),
    ('elite-performance', 'Elite Performance', '2026-06-25T14:00:00Z'::timestamptz, '2026-06-25T15:00:00Z'::timestamptz),
    ('future-elite', 'Future Elite', '2026-06-26T00:00:00Z'::timestamptz, '2026-06-26T01:00:00Z'::timestamptz),

    ('elite-performance', 'Elite Performance', '2026-06-26T13:00:00Z'::timestamptz, '2026-06-26T14:00:00Z'::timestamptz),
    ('elite-performance', 'Elite Performance', '2026-06-26T14:00:00Z'::timestamptz, '2026-06-26T15:00:00Z'::timestamptz),
    ('future-elite', 'Future Elite', '2026-06-27T00:00:00Z'::timestamptz, '2026-06-27T01:00:00Z'::timestamptz),

    ('elite-performance', 'Elite Performance', '2026-06-29T13:00:00Z'::timestamptz, '2026-06-29T14:00:00Z'::timestamptz),
    ('future-elite', 'Future Elite', '2026-06-30T00:00:00Z'::timestamptz, '2026-06-30T01:00:00Z'::timestamptz),

    ('elite-performance', 'Elite Performance', '2026-06-30T13:00:00Z'::timestamptz, '2026-06-30T14:00:00Z'::timestamptz),
    ('elite-performance', 'Elite Performance', '2026-06-30T14:00:00Z'::timestamptz, '2026-06-30T15:00:00Z'::timestamptz),
    ('future-elite', 'Future Elite', '2026-07-01T00:00:00Z'::timestamptz, '2026-07-01T01:00:00Z'::timestamptz)
)
update public.training_sessions as sessions
set
  title = launch_sessions.title,
  end_datetime = launch_sessions.end_datetime,
  timezone = 'America/Los_Angeles',
  location = 'Desert Christian Academy, 40700 Yucca Lane, Bermuda Dunes, CA 92203',
  capacity = 6,
  status = 'open'
from launch_sessions
where sessions.training_group = launch_sessions.training_group
  and sessions.start_datetime = launch_sessions.start_datetime;

with launch_sessions(training_group, title, start_datetime, end_datetime) as (
  values
    ('elite-performance', 'Elite Performance', '2026-06-16T13:00:00Z'::timestamptz, '2026-06-16T14:00:00Z'::timestamptz),
    ('elite-performance', 'Elite Performance', '2026-06-16T14:00:00Z'::timestamptz, '2026-06-16T15:00:00Z'::timestamptz),
    ('future-elite', 'Future Elite', '2026-06-17T00:00:00Z'::timestamptz, '2026-06-17T01:00:00Z'::timestamptz),
    ('elite-performance', 'Elite Performance', '2026-06-17T13:00:00Z'::timestamptz, '2026-06-17T14:00:00Z'::timestamptz),
    ('future-elite', 'Future Elite', '2026-06-18T00:00:00Z'::timestamptz, '2026-06-18T01:00:00Z'::timestamptz),
    ('elite-performance', 'Elite Performance', '2026-06-18T13:00:00Z'::timestamptz, '2026-06-18T14:00:00Z'::timestamptz),
    ('elite-performance', 'Elite Performance', '2026-06-18T14:00:00Z'::timestamptz, '2026-06-18T15:00:00Z'::timestamptz),
    ('future-elite', 'Future Elite', '2026-06-19T00:00:00Z'::timestamptz, '2026-06-19T01:00:00Z'::timestamptz),
    ('elite-performance', 'Elite Performance', '2026-06-19T13:00:00Z'::timestamptz, '2026-06-19T14:00:00Z'::timestamptz),
    ('elite-performance', 'Elite Performance', '2026-06-19T14:00:00Z'::timestamptz, '2026-06-19T15:00:00Z'::timestamptz),
    ('future-elite', 'Future Elite', '2026-06-20T00:00:00Z'::timestamptz, '2026-06-20T01:00:00Z'::timestamptz),
    ('elite-performance', 'Elite Performance', '2026-06-23T13:00:00Z'::timestamptz, '2026-06-23T14:00:00Z'::timestamptz),
    ('elite-performance', 'Elite Performance', '2026-06-23T14:00:00Z'::timestamptz, '2026-06-23T15:00:00Z'::timestamptz),
    ('future-elite', 'Future Elite', '2026-06-24T00:00:00Z'::timestamptz, '2026-06-24T01:00:00Z'::timestamptz),
    ('elite-performance', 'Elite Performance', '2026-06-24T13:00:00Z'::timestamptz, '2026-06-24T14:00:00Z'::timestamptz),
    ('future-elite', 'Future Elite', '2026-06-25T00:00:00Z'::timestamptz, '2026-06-25T01:00:00Z'::timestamptz),
    ('elite-performance', 'Elite Performance', '2026-06-25T13:00:00Z'::timestamptz, '2026-06-25T14:00:00Z'::timestamptz),
    ('elite-performance', 'Elite Performance', '2026-06-25T14:00:00Z'::timestamptz, '2026-06-25T15:00:00Z'::timestamptz),
    ('future-elite', 'Future Elite', '2026-06-26T00:00:00Z'::timestamptz, '2026-06-26T01:00:00Z'::timestamptz),
    ('elite-performance', 'Elite Performance', '2026-06-26T13:00:00Z'::timestamptz, '2026-06-26T14:00:00Z'::timestamptz),
    ('elite-performance', 'Elite Performance', '2026-06-26T14:00:00Z'::timestamptz, '2026-06-26T15:00:00Z'::timestamptz),
    ('future-elite', 'Future Elite', '2026-06-27T00:00:00Z'::timestamptz, '2026-06-27T01:00:00Z'::timestamptz),
    ('elite-performance', 'Elite Performance', '2026-06-29T13:00:00Z'::timestamptz, '2026-06-29T14:00:00Z'::timestamptz),
    ('future-elite', 'Future Elite', '2026-06-30T00:00:00Z'::timestamptz, '2026-06-30T01:00:00Z'::timestamptz),
    ('elite-performance', 'Elite Performance', '2026-06-30T13:00:00Z'::timestamptz, '2026-06-30T14:00:00Z'::timestamptz),
    ('elite-performance', 'Elite Performance', '2026-06-30T14:00:00Z'::timestamptz, '2026-06-30T15:00:00Z'::timestamptz),
    ('future-elite', 'Future Elite', '2026-07-01T00:00:00Z'::timestamptz, '2026-07-01T01:00:00Z'::timestamptz)
)
insert into public.training_sessions (
  training_group,
  title,
  start_datetime,
  end_datetime,
  timezone,
  location,
  capacity,
  status
)
select
  launch_sessions.training_group,
  launch_sessions.title,
  launch_sessions.start_datetime,
  launch_sessions.end_datetime,
  'America/Los_Angeles',
  'Desert Christian Academy, 40700 Yucca Lane, Bermuda Dunes, CA 92203',
  6,
  'open'
from launch_sessions
where not exists (
  select 1
  from public.training_sessions existing
  where existing.training_group = launch_sessions.training_group
    and existing.start_datetime = launch_sessions.start_datetime
);
