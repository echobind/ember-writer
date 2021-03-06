/* jshint node: true */
'use strict';

const Funnel = require('broccoli-funnel');
const MergeTrees = require('broccoli-merge-trees');
const BlogMarkdownParser = require('./lib/blog-markdown-parser');
const itemCounts = require('./lib/utils/item-counts');
const path = require('path');
const fs = require('fs-extra');
const _array = require('lodash/array');
const _string = require('lodash/string');
const _lang = require('lodash/lang');
const EngineAddon = require('ember-engines/lib/engine-addon');

module.exports = EngineAddon.extend({
  name: 'ember-writer',

  /**
   * Stores the config object.
   * @type {Object}
   * @property
   * @public
   */
  addonConfig: null,

  included(app) {
    if (app.project.pkg['ember-addon'] && !app.project.pkg['ember-addon'].paths) {
      this.blogDirectory = path.resolve(app.project.root, path.join('tests', 'dummy', 'blog'));
    } else {
      this.blogDirectory = path.join(app.project.root, '/blog');
    }
  },

  config: function() {
    let appConfig = require('./config/ember-writer');
    let config = getDefaultConfig();

    this.addonConfig = Object.assign(config, appConfig);

    return {
      emberWriter: this.addonConfig
    };
  },

  treeForPublic(tree) {
    let trees = [];

    if (tree) {
      trees.push(tree);
    }

    let blogFiles = new Funnel(this.blogDirectory, {
      destDir: 'api/blog',
      include: ['*.md']
    });

    this.markdownParser = new BlogMarkdownParser(blogFiles, this.addonConfig);
    trees.push(this.markdownParser);

    return new MergeTrees(trees);
  },

  postBuild(result) {
    let blogPath = path.join(result.directory, 'api', 'blog');
    let nonDraftArticles = this._removeDraftArticles();

    // posts
    fs.writeJsonSync(`${blogPath}/posts.json`, nonDraftArticles);

    // tags
    let tags = nonDraftArticles.reduce((prev, article) => {
      let articleTags = article.attributes.tags;
      articleTags = _lang.isEmpty(articleTags) ? '' : articleTags;
      let tokens = articleTags.split(/,\s*/);
      return prev.concat(tokens);
    }, []);

    let tagCounts = itemCounts(tags);

    let uniqueTags = _array.uniq(tags).map((tag) => {
      return {
        name: tag,
        postCount: tagCounts[tag]
      };
    });

    fs.writeJsonSync(`${blogPath}/tags.json`, uniqueTags);

    // authors
    let authors = nonDraftArticles.reduce((prev, post) => {
      return prev.concat(post.attributes.author);
    }, []);

    // add post counts to author data
    let authorDataFile = `${this.blogDirectory}/data/authors`;
    let authorData = require(authorDataFile);
    let authorCounts = itemCounts(authors);

    let authorsWithCounts = Object.keys(authorCounts).map((name) => {
      let author = authorData.find((a) => a.name == name);

      if (!author) {
        throw(new Error(`${name} is an author of a post but is not a known author. Please add an entry to \`data/authors.json\` for them.`));
        return;
      }

      author.postCount = authorCounts[name];

      return author;
    });

    fs.writeJsonSync(`${blogPath}/authors.json`, authorsWithCounts);
  },

  /**
   * Removes draft articles unless in a development environment.
   * @return {Array} Articles with published = false
   * @private
   */
  _removeDraftArticles() {
    let isDevelopment = this.app.env === 'development';
    let allArticles = this.markdownParser.parsedPosts;

    if (!isDevelopment) {
      let draftArticles = allArticles.filter((a) => a.attributes.published === false);
      return _array.difference(allArticles, draftArticles);
    }

    return allArticles;
  }
});

/**
 * The default config for Ember Writer
 * @return {Object} The config
 * @public
 */
function getDefaultConfig() {
  return {
    dateFormat: 'MM-DD-YYYY'
  };
}
