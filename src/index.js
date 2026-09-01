import { PDFDocument } from "pdf-lib";

/* =========================================================
   SP PDF MERGE API
   VERSION 1.0
   =========================================================
   
   Endpoint:
   POST /merge-pdf

   Request:
   {
     "files": [
       "BASE64_PDF_1",
       "BASE64_PDF_2",
       "BASE64_PDF_3"
     ]
   }

   Response:
   {
     "success": true,
     "pageCount": 3,
     "pdfBase64": "JVBERi0x..."
   }
   ========================================================= */


/* =========================================================
   CORS
========================================================= */

function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json; charset=UTF-8"
    };
}


/* =========================================================
   JSON RESPONSE
========================================================= */

function jsonResponse(data, status = 200) {

    return new Response(
        JSON.stringify(data),
        {
            status,
            headers: corsHeaders()
        }
    );
}


/* =========================================================
   BASE64 → UINT8ARRAY
========================================================= */

function base64ToUint8Array(base64) {

    try {

        // Support jika Base64 dikirim sebagai data URI
        if (base64.includes(",")) {
            base64 = base64.split(",")[1];
        }

        // Hilangkan whitespace / line break
        base64 = base64.replace(/\s/g, "");

        const binaryString = atob(base64);

        const bytes = new Uint8Array(binaryString.length);

        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        return bytes;

    } catch (error) {

        throw new Error(
            "Base64 tidak valid"
        );
    }
}


/* =========================================================
   UINT8ARRAY → BASE64
========================================================= */

function uint8ArrayToBase64(bytes) {

    let binary = "";

    const chunkSize = 0x8000;

    for (
        let i = 0;
        i < bytes.length;
        i += chunkSize
    ) {

        const chunk = bytes.subarray(
            i,
            Math.min(i + chunkSize, bytes.length)
        );

        binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
}


/* =========================================================
   MERGE PDF
========================================================= */

async function mergePDFs(files) {

    const mergedPdf = await PDFDocument.create();

    let totalPages = 0;

    for (let i = 0; i < files.length; i++) {

        const base64 = files[i];

        if (
            typeof base64 !== "string" ||
            !base64.trim()
        ) {

            throw new Error(
                `PDF file ${i + 1} kosong atau tidak valid`
            );
        }

        let pdfBytes;

        try {

            pdfBytes = base64ToUint8Array(base64);

        } catch (error) {

            throw new Error(
                `PDF file ${i + 1}: ${error.message}`
            );
        }


        let sourcePdf;

        try {

            sourcePdf = await PDFDocument.load(
                pdfBytes,
                {
                    ignoreEncryption: false
                }
            );

        } catch (error) {

            throw new Error(
                `PDF file ${i + 1} tidak valid atau rusak`
            );
        }


        const pages = await mergedPdf.copyPages(
            sourcePdf,
            sourcePdf.getPageIndices()
        );


        for (const page of pages) {

            mergedPdf.addPage(page);

            totalPages++;
        }
    }


    if (totalPages === 0) {

        throw new Error(
            "Tidak ada halaman PDF yang berhasil digabung"
        );
    }


    const mergedBytes = await mergedPdf.save();


    const mergedBase64 =
        uint8ArrayToBase64(mergedBytes);


    return {
        pdfBase64: mergedBase64,
        pageCount: totalPages
    };
}


/* =========================================================
   POST /merge-pdf
========================================================= */

async function handleMerge(request) {

    let body;

    try {

        body = await request.json();

    } catch (error) {

        return jsonResponse(
            {
                success: false,
                error: "Request body harus berupa JSON yang valid"
            },
            400
        );
    }


    /* -----------------------------------------------------
       VALIDASI FILES
    ----------------------------------------------------- */

    if (!body || !Array.isArray(body.files)) {

        return jsonResponse(
            {
                success: false,
                error: 'Field "files" harus berupa array'
            },
            400
        );
    }


    if (body.files.length === 0) {

        return jsonResponse(
            {
                success: false,
                error: "Minimal 1 file PDF diperlukan"
            },
            400
        );
    }


    /* -----------------------------------------------------
       BATAS FILE
    ----------------------------------------------------- */

    if (body.files.length > 20) {

        return jsonResponse(
            {
                success: false,
                error: "Maksimal 20 file PDF dalam satu request"
            },
            400
        );
    }


    /* -----------------------------------------------------
       MERGE
    ----------------------------------------------------- */

    try {

        const result =
            await mergePDFs(body.files);


        return jsonResponse(
            {
                success: true,
                pageCount: result.pageCount,
                pdfBase64: result.pdfBase64
            },
            200
        );


    } catch (error) {

        console.error(
            "Merge PDF error:",
            error
        );


        return jsonResponse(
            {
                success: false,
                error:
                    error?.message ||
                    "Gagal melakukan merge PDF"
            },
            400
        );
    }
}


/* =========================================================
   WORKER
========================================================= */

export default {

    async fetch(request) {

        const url =
            new URL(request.url);


        /* -------------------------------------------------
           CORS PREFLIGHT
        ------------------------------------------------- */

        if (request.method === "OPTIONS") {

            return new Response(
                null,
                {
                    status: 204,
                    headers: corsHeaders()
                }
            );
        }


        /* -------------------------------------------------
           HEALTH CHECK
        ------------------------------------------------- */

        if (
            request.method === "GET" &&
            url.pathname === "/"
        ) {

            return jsonResponse(
                {
                    success: true,
                    service: "SP PDF Merge API",
                    version: "1.0",
                    endpoint: "POST /merge-pdf"
                }
            );
        }


        /* -------------------------------------------------
           MERGE ENDPOINT
        ------------------------------------------------- */

        if (
            request.method === "POST" &&
            url.pathname === "/merge-pdf"
        ) {

            return handleMerge(request);
        }


        /* -------------------------------------------------
           NOT FOUND
        ------------------------------------------------- */

        return jsonResponse(
            {
                success: false,
                error: "Endpoint tidak ditemukan"
            },
            404
        );
    }
};
