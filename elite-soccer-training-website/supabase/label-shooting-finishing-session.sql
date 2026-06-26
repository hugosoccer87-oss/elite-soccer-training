-- Elite Soccer Training CV: label an existing session as Shooting & Finishing.
-- This does not create sessions. Replace the example UUID with the real training_sessions.id.
-- Safe pattern:
--
-- update public.training_sessions
-- set training_focus = 'shooting_finishing'
-- where id = '00000000-0000-0000-0000-000000000000';
--
-- To remove the label from a session later:
--
-- update public.training_sessions
-- set training_focus = null
-- where id = '00000000-0000-0000-0000-000000000000';

notify pgrst, 'reload schema';
