// Before the first paint (a blocking script in <head>): the landing page knows its script will run, so the
// hero demo starts from its intro, not from the finished site (home.css html.js rules).
document.documentElement.classList.add("js");
