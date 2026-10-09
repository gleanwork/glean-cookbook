### Run the commands in order

Run the step commands in one shell session, starting in the directory where the project should be
created. A `cd` in one step still applies to later steps, so do not repeat it. If your tool starts
each command in a fresh process, run each later command from the directory the earlier `cd` entered.
A step marked (new terminal) runs while an earlier step keeps running: start it in a new shell in
the starting directory, and run the steps after it in that shell.
