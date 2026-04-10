-- Rename the 'tech' enum value to 'user' on the user_role type.
-- Postgres stores enum values by position, so existing rows are updated automatically.
ALTER TYPE user_role RENAME VALUE 'tech' TO 'user';
