require('dotenv').config()

const SpotifyWebApi = require('spotify-web-api-node')
const fetch = require('node-fetch')
const parse = require('url-parse')
const glob = require('glob')
const fs = require('fs')

const scopes = ['playlist-modify-public', 'playlist-modify-private', 'playlist-read-private', 'playlist-read-collaborative', 'user-read-private', 'user-read-email']
const clientId = process.env.SPOTIFY_ID
const redirectUri = 'http://localhost/callback'
const clientSecret = process.env.SPOTIFY_SECRET

const credentials = {
  clientId: clientId,
  clientSecret: clientSecret,
  redirectUri: redirectUri
}

const spotifyApi = new SpotifyWebApi(credentials)

const getAccessToken = async () => {
  const response = await fetch(spotifyApi.createAuthorizeURL(scopes), {
    headers: {
      cookie: process.env.COOKIE
    },
    redirect: 'manual',
    method: 'GET'
  })
  const url = parse(response.headers.get('location'), true)
  return url.query.code
}

const getAllPlaylistTracks = async (playlistId, offset = 0, limit = 100) => {
  const { body: { total, items } } = await spotifyApi.getPlaylistTracks(playlistId, { limit, offset })
  const ids = items.map(item => item.track.id)
  console.log(`${offset} of ${total}`)
  const nextIds = offset + limit < total ? await getAllPlaylistTracks(playlistId, offset + limit) : []
  return [
    ...ids,
    ...nextIds
  ]
}

(async () => {
  const code = await getAccessToken()
  const { body: { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn } } = await spotifyApi.authorizationCodeGrant(code)
  spotifyApi.setAccessToken(accessToken)
  spotifyApi.setRefreshToken(refreshToken)
  console.log('The token expires in ' + expiresIn)

  const existingIds = await getAllPlaylistTracks(process.env.PLAYLIST_ID)

  const files = glob.sync('json/*.json')
  const songs = files.reduce((previous, file) => {
    const data = fs.readFileSync(file, 'utf8')
    const songs = JSON.parse(data)
    return [...previous, ...songs.map(song => `artist:${song.artist} track:${song.title}`.replace("'", ''))]
  }, [])

  for (const search of songs) {
    const { body: { tracks: { items: songs } } } = await spotifyApi.searchTracks(search)
    const song = songs[0]
    if (typeof song === 'undefined') {
      console.log(`Search "${search}" did not found anything!`)
      continue
    }
    if (!existingIds.includes(song.id)) {
      await spotifyApi.addTracksToPlaylist(process.env.PLAYLIST_ID, [`spotify:track:${song.id}`])
      // console.log(`Search "${search}" found "${song.name}" - added!`)
    } else {
      // console.log(`Search "${search}" found "${song.name}" - already exists!`)
    }
  }
})()
