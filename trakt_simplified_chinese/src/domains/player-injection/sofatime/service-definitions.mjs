import {
    PLAYER_DEFINITIONS,
    PLAYER_LOGO_ASSET_BASE_URL,
    PLAYER_TYPE,
    REGION_CODES
} from "../player-definitions.mjs";
import { createZeroPriorityMap } from "../../../shared/common.mjs";

const SOFA_TIME_COUNTRY_SERVICE_TYPES = {
    addon: true,
    buy: true,
    rent: true,
    free: true,
    subscription: true
};

const TMDB_PROVIDER_LIST_ENTRIES = Object.values(PLAYER_TYPE).map((source) => {
    const definition = PLAYER_DEFINITIONS[source];
    return {
        display_priorities: createZeroPriorityMap(REGION_CODES),
        display_priority: 0,
        logo_path: `/${definition.logo}`,
        provider_name: definition.name,
        provider_id: ({
            [PLAYER_TYPE.EPLAYERX]: 1,
            [PLAYER_TYPE.FORWARD]: 2,
            [PLAYER_TYPE.INFUSE]: 3
        })[source]
    };
});

function buildCustomPlayerImageSet(logoName) {
    return {
        lightThemeImage: `${PLAYER_LOGO_ASSET_BASE_URL}/${logoName}`,
        darkThemeImage: `${PLAYER_LOGO_ASSET_BASE_URL}/${logoName}`,
        whiteImage: `${PLAYER_LOGO_ASSET_BASE_URL}/${logoName}`
    };
}

function createSofaTimeTemplate(definition) {
    return {
        service: {
            id: definition.type,
            name: definition.name,
            homePage: definition.homePage,
            themeColorCode: definition.color,
            imageSet: buildCustomPlayerImageSet(definition.logo)
        },
        type: "subscription",
        link: "",
        videoLink: "",
        quality: "hd",
        audios: [],
        subtitles: [],
        expiresSoon: false,
        availableSince: 0
    };
}

function createSofaTimeCountryService(definition) {
    return {
        id: definition.type,
        name: definition.name,
        homePage: definition.homePage,
        themeColorCode: definition.color,
        imageSet: buildCustomPlayerImageSet(definition.logo),
        streamingOptionTypes: { ...SOFA_TIME_COUNTRY_SERVICE_TYPES },
        addons: []
    };
}

export {
    createSofaTimeCountryService,
    createSofaTimeTemplate,
    TMDB_PROVIDER_LIST_ENTRIES
};
