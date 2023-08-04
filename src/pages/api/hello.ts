import { NextApiRequest, NextApiResponse } from 'next';
import ytdl from 'ytdl-core';
import { YoutubeTranscript } from 'youtube-transcript';
import cuid from 'cuid';
import fsSync, { promises as fs } from 'fs';
import path from 'path';
import url from 'url';

const videoDir = 'videos';

// Make sure the video directory exists
if (!fsSync.existsSync(videoDir)) {
  fsSync.mkdirSync(videoDir);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { videoId, videoUrl } = req.query;

  if (typeof videoId !== 'string' && typeof videoUrl !== 'string') {
    res.status(400).send('Either video ID or video URL must be provided');
    return;
  }

  try {
    // Extract video ID from URL if provided
    let finalVideoId = videoId;
    if (videoUrl) {
      const parsedUrl = url.parse(videoUrl.toString(), true);
      const queryParameters = parsedUrl.query;
      finalVideoId = queryParameters['v'] as string;
    }

    if (!finalVideoId) {
      res.status(400).send('Invalid video ID or URL');
      return;
    }

    // Generate filenames for video and transcript
    const fileId = finalVideoId.toString();
    const videoFilename = path.join(videoDir, fileId + '.mp4');
    const transcriptFilename = path.join(videoDir, fileId + '.json');

    // Download video
    const videoStream = ytdl(`https://www.youtube.com/watch?v=${videoId}`);
    videoStream.pipe(fsSync.createWriteStream(videoFilename));

    // Fetch transcript
    const transcripts = await YoutubeTranscript.fetchTranscript(finalVideoId.toString());

    // Save transcript to file
    await fs.writeFile(transcriptFilename, JSON.stringify(transcripts));

    res.status(200).json({
      videoFilename,
      transcriptFilename,
      message: 'Files downloaded successfully',
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while downloading the video and transcript.');
  }
}
