#!/usr/bin/env node
// emacs mode -*-JavaScript-*-

const getopt = require('node-getopt');
const {google} = require('googleapis');
const customsearch = google.customsearch('v1');

// This script requires that you create a Google Custom Search engine
// You can do that here: https://developers.google.com/custom-search/v1/introduction

// If you want, you can hardcode Google Custom Search API credentials into this file.
// This is not recommended for security reasons. You have been warned
const defaultKey = '';   // put your default Google Custom Search API key inside the quotes
const defaultEngine = '';  // put your default Google Custom Search API engine ID inside the quotes

// parse command-line options
let opt = getopt.create([
  ['p' , 'pattern=PATTERN'   , 'specify snowclone pattern (* for wildcard)'],
  ['k' , 'key=API_KEY'       , 'specify Google Custom Search API key'],
  ['e' , 'engine=ENGINE_KEY' , 'specify Google Custom Search engine ID'],
  ['a' , 'alphabetic'        , 'allow only alphabetic characters in snowclones (i.e. no numeric digits)'],
  ['m' , 'maxcalls=N'        , 'limit number of calls to search API'],
  ['s' , 'site=SITE'         , 'limit search to a particular website (e.g. twitter.com)'],
  ['v' , 'verbose'           , 'summarize search results as they come in'],
  ['d' , 'debug'             , 'display full search results as they come in'],
  ['h' , 'help'              , 'display this help message']
])              // create Getopt instance
    .bindHelp()     // bind option 'help' to default action
    .parseSystem(); // parse command line

if (!opt.options.pattern) {
  console.error ("Please specify a pattern with -p");
  process.exit();
}

async function runSearch(options) {
  if (opt.options.debug)
    console.warn (options);
  const res = await customsearch.cse.list (options);
  return res.data;
}

const query = opt.options.pattern.replace(/\s+/g,'+');
const queryRegex = new RegExp (opt.options.pattern.toLowerCase().replace(/\s+/g,' ').replace(/\*/g,'\\S+'));
if (opt.options.verbose)
  console.warn (queryRegex);
const searchOptions = {
  q: '"' + query + '"',
  auth: opt.options.key || defaultKey,
  cx: opt.options.engine || defaultEngine,
};
if (opt.options.site)
  Object.assign (searchOptions,
                 { siteSearch: opt.options.site,
                   siteSearchFilter: 'i' });

const removeCharRegex = new RegExp (opt.options.alphabetic ? '[^a-z]' : '[^a-z0-9]', 'g');

const maxResults = 100;   // hard limit of Google Custom Search API: https://developers.google.com/custom-search/v1/reference/rest/v1/cse/list
const resultsPerCall = 10;
const apiCallLimit = Math.ceil (maxResults / resultsPerCall);
const maxCalls = opt.options.maxcalls ? Math.min (apiCallLimit, Math.max (opt.options.maxcalls, 0)) : apiCallLimit;
const getResults = new Array (maxCalls).fill(0).reduce ((promise, _x, call) => {
  const start = 1 + call * resultsPerCall;
  return promise.then ((results) => {
    console.warn ("Fetching results " + start + " to " + (start + resultsPerCall - 1));
    const opts = Object.assign ({ start,
                                  num: resultsPerCall },
                                searchOptions);
    return runSearch(opts)
      .catch(console.error)
      .then ((data) => {
        if (opt.options.debug)
          console.warn (data);
        return results.concat (data.items.reduce ((list, item) => {
          return list.concat ([item.title, item.snippet].reduce ((itemMatches, text) => {
            const snowclone = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace (removeCharRegex,' ').replace(/\s+/g,' ');
            if (opt.options.verbose)
              console.warn (text);
            const match = queryRegex.exec (snowclone);
            return itemMatches.length ? itemMatches : (match ? [match[0]] : []);  // don't count a hit twice if it's in title & snippet
          }, []));
        }, []));
      });
  });
}, Promise.resolve ([]));

getResults
  .then ((results) => {
    let count = {};
    results.forEach ((result) => count[result] = (count[result] || 0) + 1);
    Object.keys(count)
      .sort ((a, b) => count[b] - count[a])
      .forEach ((snowclone) => {
      console.log (snowclone + ': ' + count[snowclone]);
    });
  });
