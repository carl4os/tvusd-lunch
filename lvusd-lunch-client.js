const https = require("https");

// Cache for unique meals
let cachedUniqueMeals = [];

async function getMenuIdFromRedirect() {
    return new Promise((resolve, reject) => {
        https.get('https://temeculafreshfood.com/downloadMenu.php/2011131657512943/761050', (res) => {
            if (res.statusCode === 302 && res.headers.location) {
                console.log(`Redirected to: ${res.headers.location}`);
                
                // Parse the redirected URL to extract query parameters
                const redirectedUrl = res.headers.location;
                const fragmentIndex = redirectedUrl.indexOf("#");
                
                if (fragmentIndex !== -1) {
                    const fragment = redirectedUrl.substring(fragmentIndex + 1); // Extract after #
                    const params = new URLSearchParams(fragment.split("?")[1]); // Get the query part
                    const menuId = params.get("id"); // Extract menuId

                    if (menuId) {
                        console.log(`Extracted menuId: ${menuId}`);
                        resolve(menuId);
                    } else {
                        reject(new Error("menuId not found in URL fragment"));
                    }
                } else {
                    reject(new Error("No fragment found in redirected URL"));
                }
            } else {
                reject(new Error("No redirect found"));
            }
        }).on('error', (err) => {
            reject(err);
        });
    });
}
// Internal function to fetch data from the API
async function fetchMenuDataFromApi(monthId) {
  return new Promise((resolve, reject) => {
    console.log("Fetching menu for monthId:", monthId);

    const query = `
    {
      menu(id: "${monthId}") {
        year
        month
        items {
          day
          product {
            name
          }
        }
      }
    }`;

    console.log("GraphQL Query:", query);

    const options = {
      hostname: "api.isitesoftware.com",
      path: `/graphql?query=${encodeURIComponent(query)}`,
      method: "GET",
      headers: {
        "Content-Type": "application/json"
      }
    };

    const req = https.request(options, res => {
      let data = "";

      res.on("data", chunk => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const jsonData = JSON.parse(data);

          if (!jsonData.data || !jsonData.data.menu) {
            return reject(new Error("Invalid response structure"));
          }
          
          resolve(jsonData.data.menu);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on("error", reject);
    req.end();
  });
}

async function extractMenuData(monthId) {
    var menuData = await fetchMenuDataFromApi(monthId)
    var uniqueMeals = [];
    if (menuData.nextMonthPublished) {
        console.log("Json next month id:", menuData.nextMonthPublished.id);
        var nextMonthMeals = await fetchMenuDataFromApi(menuData.nextMonthPublished.id);
        uniqueMeals = uniqueMeals.concat(await getUniqueMealsFromData(nextMonthMeals));
    }
   
    uniqueMeals = uniqueMeals.concat(await getUniqueMealsFromData(menuData));
    console.log("First meal:", uniqueMeals[0]);
    cachedUniqueMeals = uniqueMeals;
    return cachedUniqueMeals;
}

async function getUniqueMealsFromData(menuData)
{
    const { year, month, items } = menuData;
    const uniqueMeals = [];
    const seenDates = new Set();
    console.log("Number of items:", items.length);

    for (const item of items) {
      const fullDate = `${year}-${String(month).padStart(2, "0")}-${String(item.day).padStart(2, "0")}`;
      if (!seenDates.has(fullDate)) {
        uniqueMeals.push({
          date: fullDate,
          meal: item.product.name
        });
        seenDates.add(fullDate);
      }
    }
    console.log("Unique meals:", uniqueMeals.length);
    return uniqueMeals;
}

// Public function to get menu data with caching
async function fetchTvusdLunchData(monthId) {
  if (cachedUniqueMeals.length > 0) {
    console.log("Returning cached data.");
    return cachedUniqueMeals;
  }

  console.log("Fetching new data from API...");
  return await extractMenuData(monthId);
}

async function needMenuRequest()
{
    return cachedUniqueMeals.length === 0
}

// Function to extract menuId from URL
function extractMenuId(url) {
  const regex = /id=([^&]+)/;
  const match = url.match(regex);
  return match ? match[1] : null;
}


module.exports = {
    fetchTvusdLunchData,
    getMenuIdFromRedirect,
    needMenuRequest
};
