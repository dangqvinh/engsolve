-- Run ONCE in the Supabase SQL editor after creating your admin user
-- (Dashboard → Authentication → Users → Add user). Replace the email.
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'quang.vinh.12.nion@gmail.com');
