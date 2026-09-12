CREATE ROLE publisher_admin_app LOGIN PASSWORD 'admin-local-only';
CREATE ROLE publisher_comments_app LOGIN PASSWORD 'comments-local-only';
CREATE DATABASE publisher_admin OWNER publisher_admin_app;
CREATE DATABASE publisher_comments OWNER publisher_comments_app;
CREATE DATABASE publisher_admin_restore OWNER publisher_admin_app;
CREATE DATABASE publisher_comments_restore OWNER publisher_comments_app;
