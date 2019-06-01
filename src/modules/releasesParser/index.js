import RPN from 'request-promise-native';
import log from '../../utils/log';
import Firestore from '../../misc/firestore';
import UrlHandler from '../urlHandler';

export default class ReleasesParser {
    /**
     * Fetch GitHub API
     * @param {boolean} [forceParse=false]
     * @returns {void}
     */
    static async fetch(forceParse) {
        //Schedule next fetch
        setTimeout(this.fetch.bind(this), 3600 * 1000);

        const options = {
            uri: 'https://api.github.com/repos/OpenRCT2/OpenRCT2/releases',
            qs: {},
            json: true,
            headers: {
                'User-Agent': 'OpenRCT2.org'
            }
        };

        try {
            const jsonData = await RPN(options);
            await this.parse(jsonData);
        } catch (error) {
            log.error(error);
        }

        log.debug('Fetched releases');
    }

    /**
     * Parse content
     * @param {Object} jsonData
     * @returns {Promise<void>}
     */
    static parse(jsonData) {
        return new Promise(async (resolve, reject) => {
            for (const jsonReleaseData of jsonData) {
                //Skip drafts
                if (jsonReleaseData['draft'])
                    continue;

                try {
                    await this.parseReleaseData(jsonReleaseData);
                } catch(error) {
                    log.warn(error);
                }

            }

            resolve();
        });
    }

    /**
     * Parse release data
     * @param data
     */
    static async parseReleaseData(data) {
        return new Promise(async (resolve, reject) => {
            const branch = 'releases';

            const docPath = `${branch}-${data['id']}`;
            const releaseDoc = Firestore.collection('releases').doc(docPath);
            try {
                if (!(await releaseDoc.get()).exists) {
                    await releaseDoc.set({
                        id: data['id'],
                        name: data['name'],
                        version: data['tag_name'],
                        created: data['created_at'] ? new Date(data['created_at']) : undefined,
                        published: data['published_at'] ? new Date(data['published_at']) : undefined,
                        url: data['html_url'],
                        notes: data['body'],
                        branch
                    }, {
                        merge: true
                    });

                    log.info(`Stored '${docPath}' in Firestore`);
                }
            } catch (error) {
                reject(error);
                return;
            }

            //Parse assets
            const assetsCol = releaseDoc.collection('assets');
            if (data['assets']) {
                for (const assetData of data['assets']) {
                    const assetDocRef = assetsCol.doc(`${assetData['id']}`);

                    try {
                        const assetResult = await assetDocRef.get();
                        if (!assetResult.exists) {
                            const url = assetData['browser_download_url'];
                            await assetDocRef.set({
                                id: assetData['id'],
                                url,
                                fileSize: assetData['size'],
                                fileName: assetData['name'],
                                fileHash: await UrlHandler.getHash(url)
                            });
                        }
                    } catch (error) {
                        log.warn(error);
                    }
                }
            } else {
                //Delete all documents from collection
                try {
                    await Firestore.deleteCollection(assetsCol, 10);
                } catch (error) {
                    log.warn(error);
                }
            }


            resolve();
        });
    }
}

ReleasesParser.fetch(true);