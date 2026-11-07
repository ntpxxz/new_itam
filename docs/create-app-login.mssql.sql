-- Creates the SQL login the app uses when DB_CLIENT=mssql (see .env.example).
-- Run once as a sysadmin, after setting the password below; put the same password in .env (MSSQL_PASSWORD).
--   SSMS: turn on Query > SQLCMD Mode, then Execute (F5)
--   or:   sqlcmd -S localhost,1433 -E -C -i docs\create-app-login.mssql.sql
-- db_owner on ITAM only: the app creates/updates its tables on start, and `npm run seed` drops and recreates them.

:setvar AppPassword "CHANGE-ME-Strong#Pass1"

USE master;
IF DB_ID(N'ITAM') IS NULL CREATE DATABASE ITAM COLLATE Thai_100_CI_AS;
IF SUSER_ID(N'itam_app') IS NULL
  CREATE LOGIN itam_app WITH PASSWORD = N'$(AppPassword)', CHECK_POLICY = ON, DEFAULT_DATABASE = ITAM;
GO

USE ITAM;
IF USER_ID(N'itam_app') IS NULL CREATE USER itam_app FOR LOGIN itam_app;
ALTER ROLE db_owner ADD MEMBER itam_app;
GO
