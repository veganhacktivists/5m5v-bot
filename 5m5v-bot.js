#!/usr/bin/env node

require('dotenv').config();

if ([
  'TWITTER_API_KEY',
  'TWEETS_API_ENDPOINT',
  'TWEETS_API_KEY',
].some(key => !process.env[key])) {
  console.error('One or more required environment variables are missing. Exiting.');
  process.exit(1);
}

const { Rettiwt } = require('rettiwt-api');
const axios = require('axios');
const TweetFilter = require('./lib/filter');

const pollingIntervalMs = 21 * 60 * 1000;
const retryDelayAfterErrorMs = 5 * 60 * 1000;
const isDryRun = process.argv[2] === '--dry-run';

const languageKeys = {
  english: 'en',
  french: 'fr',
  spanish: 'es',
  german: 'de',
};

const tweetFilter = new TweetFilter([], Object.keys(languageKeys));

const streamFilter = {
  includeWords: [
    '"vegan" OR "végétalien" OR "végétalienne" OR "végane" OR "vegano" OR "vegana"',
    '"I want to" OR "I would like" OR "thinking of" OR "I should try" OR "plan on" OR "I wish" OR "devenir" OR "je veux" OR "j\'ai envie" OR "je voudrais" OR "j\'aimerais" OR "Quiero" OR "Deseo" OR "Estoy pensando en" OR "Voy a" OR "Ich will" OR "Ich möchte" OR "Ich beabsichtige" OR "Ich habe vor"',
  ],
};

(async () => {
  while (true) {
    const rettiwt = new Rettiwt({ apiKey: process.env.TWITTER_API_KEY });

    console.log(isDryRun ? 'Looking for new tweets (dry run)...' : 'Looking for new tweets...');

    try {
      for await (const tweet of rettiwt.tweet.stream(streamFilter, pollingIntervalMs)) {
        const matchingLanguages = tweetFilter.matches(tweet) || [];

        console.log('Found tweet', tweet.id, tweet.fullText, matchingLanguages);

        for (const language of matchingLanguages) {
          try {
            if (!isDryRun) {
              await axios.post(process.env.TWEETS_API_ENDPOINT, {
                lang: languageKeys[language],
                tweets: [buildTweetPayload(tweet)],
              }, {
                headers: {
                  'X-API-KEY': process.env.TWEETS_API_KEY,
                },
             });
            }

            console.log(`Sent tweet ${tweet.id} in ${language}:\n${tweet.fullText}`);
          } catch (error) {
            console.error(`Unable to send tweet ${tweet.id} in ${language}: ${error.message}`);
          }
        }
      }
    } catch (error) {
      console.error(`Error while streaming tweets: ${error.message}`);

      await new Promise(resolve => setTimeout(resolve, retryDelayAfterErrorMs));
    }
  }
})();

function buildTweetPayload(tweet) {
  return {
    id: tweet.id,
    date: tweet.createdAt,
    text: tweet.fullText,
    from_user_name: tweet.tweetBy.userName,
    from_full_name: tweet.tweetBy.fullName,
    from_profile_image: tweet.tweetBy.profileImage,
    view_count: ~~tweet.viewCount,
    like_count: ~~tweet.likeCount,
    reply_count: ~~tweet.replyCount,
    retweet_count: ~~tweet.retweetCount,
    quote_count: ~~tweet.quoteCount,
    media: (tweet.media ?? []).map(media => ({ ...media })),
  };
}
