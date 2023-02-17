#!/usr/bin/env node

const fs = require('fs').promises
const { spawnSync } = require('child_process')
const { resolve, join } = require('path')
const localeCompare = require('@isaacs/string-locale-compare')('en')
const EOF = '\n'

// Get a list of possibly duplicated names and emails from the authors list
// that can be fixed by adding them to .mailmap and then the update-authors
// script will dedupe them. If there are duplicates that are legitimate then
// maybe this script should add an allowlist, but there's no need right now.

const authorRegex = /^(.*?)\s<(.*?)>$/
const mailmapRegex = /^(.*?)\s<(.*?)>(?:\s<(.*?)>)?$/
const mailmapLine = (name, ...emails) => `${name} ${emails.map((e) => `<${e}>`).join(' ')}`

const getAuthors = async (path) => {
  const authorLines = (await fs.readFile(path, 'utf-8')).trim().split(EOF)

  const names = {}
  const emails = {}
  for (const line of authorLines) {
    if (!line.startsWith('#')) {
      const [, name, email] = line.match(authorRegex)
      if (names[name]) {
        names[name].push(email)
      } else {
        names[name] = [email]
      }
      if (emails[email]) {
        emails[email].push(name)
      } else {
        emails[email] = [name]
      }
    }
  }

  return { names, emails }
}

const findDuplicates = (authors) => {
  const duplicates = []

  for (const [name, emails] of Object.entries(authors.names)) {
    if (emails.length > 1) {
      for (const email of emails) {
        delete authors.emails[email]
      }
      duplicates.push(...emails.slice(1).map((email) => mailmapLine(name, emails[0], email)))
    }
  }

  for (const [email, names] of Object.entries(authors.emails)) {
    if (names.length > 1) {
      duplicates.push(...names.map((name) => mailmapLine(name, email)))
    }
  }

  return duplicates
}

const updateMailmap = async (path, update) => {
  const mailmap = (await fs.readFile(path, 'utf-8')).trim().split(EOF)

  return [...mailmap, ...update].sort((a, b) => {
    const [, aName] = a.match(mailmapRegex)
    const [, bName] = b.match(mailmapRegex)
    return localeCompare(aName, bName)
  }).join(EOF) + EOF
}

const run = async (dir) => {
  const authorsFile = join(dir, 'AUTHORS')
  const mailmapFile = join(dir, '.mailmap')

  const authors = await getAuthors(authorsFile)
  const duplicates = findDuplicates(authors)

  await updateMailmap(mailmapFile, duplicates)
    .then((d) => fs.writeFile(mailmapFile, d, 'utf-8'))
}

const cwd = resolve(__dirname, '..')

run(cwd)
  .then(() => {
    const authors = spawnSync('node scripts/update-authors.js', {
      shell: true,
      cwd,
      encoding: 'utf-8',
    })
    if (authors.status !== 0) {
      throw new Error(`Error updating authors: ${authors}`)
    }
    return null
  })
  .catch((err) => {
    process.exitCode = 1
    // eslint-disable-next-line no-console
    console.error(err)
  })
