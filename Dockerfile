FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY AzTuLms.Api/AzTuLms.Api.csproj AzTuLms.Api/
RUN dotnet restore AzTuLms.Api/AzTuLms.Api.csproj
COPY AzTuLms.Api/ AzTuLms.Api/
RUN dotnet publish AzTuLms.Api/AzTuLms.Api.csproj -c Release -o /out --no-restore /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
ENV ASPNETCORE_ENVIRONMENT=Production
ENV PORT=8080
COPY --from=build /out/ ./
USER $APP_UID
EXPOSE 8080
ENTRYPOINT ["dotnet", "AzTuLms.Api.dll"]
