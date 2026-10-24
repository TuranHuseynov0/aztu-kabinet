using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace AzTuLms.Api;

public sealed class TimetableCatalog(string json)
{
    private readonly JsonObject data = JsonNode.Parse(json)!.AsObject();

    // Resolve only from the authenticated session's upstream course list.
    public JsonObject? ForLectures(string lecturesJson)
    {
        var root = JsonNode.Parse(lecturesJson);
        var lectures = root as JsonArray ?? root?["data"] as JsonArray ?? root?["results"] as JsonArray;
        if (lectures is null) return null;
        var groups = data["groups"]!.AsObject();
        var counts = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var lecture in lectures.OfType<JsonObject>())
            foreach (var field in new[] { "lecture_name", "subject_group", "group_name" })
            {
                if (lecture[field] is not JsonValue value || !value.TryGetValue<string>(out var text)) continue;
                foreach (Match match in Regex.Matches(text.ToLowerInvariant(), @"(?:^|[^a-z0-9])(\d{4}[a-z]{1,3}\d*)(?=$|[^a-z0-9])"))
                {
                    var group = match.Groups[1].Value;
                    if (groups.ContainsKey(group)) counts[group] = counts.GetValueOrDefault(group) + 1;
                }
            }
        var ranked = counts.OrderByDescending(x => x.Value).ToArray();
        if (ranked.Length == 0 || (ranked.Length > 1 && ranked[0].Value == ranked[1].Value)) return null;
        var own = ranked[0].Key;
        var response = new JsonObject();
        foreach (var pair in data.Where(x => x.Key != "groups")) response[pair.Key] = pair.Value?.DeepClone();
        response["groups"] = new JsonObject { [own] = groups[own]!.DeepClone() };
        return response;
    }
}
