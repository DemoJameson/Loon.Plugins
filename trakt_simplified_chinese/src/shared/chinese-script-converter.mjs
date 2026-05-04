import { Converter } from "opencc-js/t2cn";

const REGION_TO_SIMPLIFIED_CONVERTER = {
    hk: Converter({ from: "hk", to: "cn" }),
    tw: Converter({ from: "tw", to: "cn" }),
};

function convertRegionalTraditionalChineseToSimplified(value, region) {
    const normalizedRegion = String(region ?? "")
        .trim()
        .toLowerCase();
    const converter = REGION_TO_SIMPLIFIED_CONVERTER[normalizedRegion];
    return converter ? converter(String(value ?? "")) : value;
}

export { convertRegionalTraditionalChineseToSimplified };
