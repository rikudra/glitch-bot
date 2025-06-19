
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args))
const { Client } = require('@notionhq/client')
require('dotenv').config()

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
  fetch: fetch
})

const databaseId = process.env.NOTION_DATABASE_ID

async function addPageToDatabase() {
  try {
    const response = await notion.pages.create({
      parent: {
        database_id: databaseId
      },
      properties: {
        名前: {
          title: [
            {
              text: {
                content: 'りっくんの新しいタスク♡'
              }
            }
          ]
        },
        メモ: {
          rich_text: [
            {
              text: {
                content: 'これはGlitchから追加したメモだよ〜！'
              }
            }
          ]
        }
      }
    })

    console.log('🎉 ページ追加成功！ページID:', response.id)
  } catch (error) {
    console.error('💥 ページ追加エラー！', error.body || error)
  }
}

addPageToDatabase()
