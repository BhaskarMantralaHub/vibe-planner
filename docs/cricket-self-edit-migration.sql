-- Allow signed-up players to update their own cricket_players record
CREATE POLICY "Players can update own record"
ON cricket_players FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
