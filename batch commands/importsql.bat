echo DROP DATABASE IF EXISTS db_trace; > deleteDatabase.bat
echo CREATE DATABASE db_trace; > createDatabase.bat
mysql -h localhost -u root < deleteDatabase.bat
mysql -h localhost -u root < createDatabase.bat
mysql -h localhost -u root db_trace < ../database/db_trace.sql
del deleteDatabase.bat
del createDatabase.bat